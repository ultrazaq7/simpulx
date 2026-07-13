// realtime: WebSocket hub untuk dashboard. Mengonsumsi message.persisted dari
// NATS (queue group, satu instance yang meneruskan), lalu fan-out lewat Redis
// pub/sub sehingga SEMUA instance realtime menyiarkan ke klien lokalnya.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"

	"github.com/simpulx/v2/libs/go/broker"
	"github.com/simpulx/v2/libs/go/config"
	"github.com/simpulx/v2/libs/go/events"
	logx "github.com/simpulx/v2/libs/go/log"
)

const redisChannelPrefix = "rt:events:"

// writeWait caps how long a single WebSocket write may block. Without it a slow
// or half-open client makes WriteMessage hang forever, stalling that client's
// stream (and its ping) until the 60s read deadline eventually reaps it. With it
// a stuck write errors out -> writePump exits -> the client reconnects + refetches.
const writeWait = 10 * time.Second

// devSecret is the default JWT secret used in development. When the JWT_SECRET
// matches this value, the /ws endpoint also accepts the legacy ?org= query param
// for backward compatibility (dev only).
const devSecret = "dev_change_me_in_prod"

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true }, // TODO: restrict to known origins in prod
}

// ── JWT parsing (mirrors gateway/auth.go claims) ──────────────

type wsClaims struct {
	OrgID string `json:"org"`
	Role  string `json:"role"`
	jwt.RegisteredClaims
}

func parseWSToken(tokenStr, secret string) (*wsClaims, error) {
	c := &wsClaims{}
	_, err := jwt.ParseWithClaims(tokenStr, c, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(secret), nil
	})
	if err != nil {
		return nil, err
	}
	return c, nil
}

func main() {
	log := logx.New("realtime")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	jwtSecret := config.Get("JWT_SECRET", devSecret)

	rdb := redis.NewClient(mustRedisOpts(config.Get("REDIS_URL", "redis://redis:6379")))
	defer rdb.Close()

	bus, err := broker.Connect(config.Get("NATS_URL", "nats://nats:4222"))
	if err != nil {
		log.Error("nats connect failed", "err", err)
		os.Exit(1)
	}
	defer bus.Close()

	h := newHub()

	// 1) NATS -> Redis: satu instance (queue group) meneruskan tiap event yang
	//    relevan untuk dashboard ke Redis.
	forward := func(env events.Envelope) error {
		raw, _ := json.Marshal(env)
		return rdb.Publish(ctx, redisChannelPrefix+env.OrgID, raw).Err()
	}
	subs := []struct{ subject, durable string }{
		{events.SubjectMessagePersisted, "realtime-msg"},
		{events.SubjectConversationAssigned, "realtime-assigned"},
		{events.SubjectConversationUpdated, "realtime-updated"},
		{events.SubjectCampaignUpdated, "realtime-campaign"},
		{events.SubjectConversationClosed, "realtime-closed"},
		{events.SubjectContactDeleted, "realtime-contact-deleted"},
		{events.SubjectConversationHandoff, "realtime-handoff"},
		{events.SubjectAgentDeactivated, "realtime-deactivated"},
		{events.SubjectAuditCreated, "realtime-audit"},
		{events.SubjectCallUpdated, "realtime-call"},
		{events.SubjectAIActivity, "realtime-ai-activity"},
	}
	for _, s := range subs {
		if err := bus.Subscribe(s.subject, s.durable, forward); err != nil {
			log.Error("subscribe failed", "subject", s.subject, "err", err)
			os.Exit(1)
		}
	}

	// 2) Redis -> klien lokal: tiap instance mendengarkan semua channel rt:events:*.
	go func() {
		sub := rdb.PSubscribe(ctx, redisChannelPrefix+"*")
		for msg := range sub.Channel() {
			orgID := strings.TrimPrefix(msg.Channel, redisChannelPrefix)
			h.broadcast(orgID, []byte(msg.Payload))
		}
	}()

	// HTTP: WebSocket + health
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200); _, _ = w.Write([]byte("ok")) })
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		// Authenticate: derive org from JWT token
		var orgID string

		tokenStr := r.URL.Query().Get("token")
		if tokenStr != "" {
			claims, err := parseWSToken(tokenStr, jwtSecret)
			if err != nil {
				log.Warn("ws auth failed", "err", err)
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			orgID = claims.OrgID
		} else if jwtSecret == devSecret {
			// Dev fallback: accept ?org= only when JWT_SECRET is the dev default
			orgID = r.URL.Query().Get("org")
			if orgID == "" {
				http.Error(w, "token or org required", http.StatusBadRequest)
				return
			}
			log.Warn("ws connected via insecure ?org= (dev mode only)", "org", orgID)
		} else {
			// Production: no token = reject
			http.Error(w, "unauthorized: token required", http.StatusUnauthorized)
			return
		}

		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		c := &client{orgID: orgID, conn: conn, send: make(chan []byte, 64)}
		h.add(c)
		log.Info("ws connected", "org", orgID)
		go writePump(c)
		readPump(h, c) // blok sampai koneksi tutup
		log.Info("ws disconnected", "org", orgID)
	})

	port := config.Get("PORT", "8082")
	srv := &http.Server{Addr: ":" + port, Handler: mux}
	go func() {
		log.Info("realtime listening", "port", port)
		_ = srv.ListenAndServe()
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	shutCtx, c := context.WithTimeout(context.Background(), 3*time.Second)
	defer c()
	_ = srv.Shutdown(shutCtx)
	log.Info("realtime stopped")
}

func writePump(c *client) {
	ticker := time.NewTicker(30 * time.Second)
	defer func() { ticker.Stop(); c.conn.Close() }()
	for {
		select {
		case msg, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, nil)
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func readPump(h *hub, c *client) {
	defer h.remove(c)
	c.conn.SetReadLimit(4096)
	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})
	for {
		if _, _, err := c.conn.ReadMessage(); err != nil {
			return
		}
	}
}

func mustRedisOpts(url string) *redis.Options {
	opt, err := redis.ParseURL(url)
	if err != nil {
		return &redis.Options{Addr: "redis:6379"}
	}
	return opt
}
