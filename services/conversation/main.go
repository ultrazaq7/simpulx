// conversation: routing & lifecycle percakapan. Mengonsumsi conversation.handoff
// (assign agen via round-robin least-loaded), menjalankan lifecycle ticker
// (auto-close idle), dan mengekspos REST assign/close untuk dashboard.
package main

import (
	"context"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/simpulx/v2/libs/go/broker"
	"github.com/simpulx/v2/libs/go/config"
	"github.com/simpulx/v2/libs/go/db"
	"github.com/simpulx/v2/libs/go/events"
	logx "github.com/simpulx/v2/libs/go/log"
)

type app struct {
	st        *store
	bus       *broker.Broker
	idleHours int
	log       interface {
		Info(string, ...any)
		Error(string, ...any)
		Warn(string, ...any)
	}
}

func main() {
	log := logx.New("conversation")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	pool, err := db.Connect(ctx, config.Get("DATABASE_URL", ""))
	if err != nil {
		log.Error("db connect failed", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	bus, err := broker.Connect(config.Get("NATS_URL", "nats://nats:4222"))
	if err != nil {
		log.Error("nats connect failed", "err", err)
		os.Exit(1)
	}
	defer bus.Close()

	a := &app{
		st:        &store{pool: pool},
		bus:       bus,
		idleHours: config.GetInt("AUTO_CLOSE_IDLE_HOURS", 48),
		log:       log,
	}

	// Konsumsi handoff -> assign agen.
	if err := bus.Subscribe(events.SubjectConversationHandoff, "conversation-routing", a.onHandoff); err != nil {
		log.Error("subscribe handoff failed", "err", err)
		os.Exit(1)
	}

	// Lifecycle ticker (auto-close idle).
	interval := time.Duration(config.GetInt("LIFECYCLE_INTERVAL_MIN", 15)) * time.Minute
	go a.runLifecycle(ctx, interval, a.idleHours)
	go a.runSnoozeSweeper(ctx, time.Minute) // snoozes need ~1-min granularity + run-on-start

	// HTTP REST + health.
	port := config.Get("PORT", "8083")
	srv := &http.Server{Addr: ":" + port, Handler: a.routes(),
		ReadTimeout: 10 * time.Second, WriteTimeout: 10 * time.Second}
	go func() {
		log.Info("conversation listening", "port", port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("http error", "err", err)
			os.Exit(1)
		}
	}()
	log.Info("conversation routing active", "idle_hours", a.idleHours)

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	cancel()
	shutCtx, c := context.WithTimeout(context.Background(), 5*time.Second)
	defer c()
	_ = srv.Shutdown(shutCtx)
	log.Info("conversation stopped")
}
