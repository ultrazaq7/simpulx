// broadcasts: eksekusi broadcast. Mengonsumsi broadcast.requested, meng-expand
// penerima, mem-publish message.outbound per kontak dengan throttle (rate limit),
// dan memperbarui progres broadcast.
package main

import (
	"context"
	"encoding/json"
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
	st     *store
	bus    *broker.Broker
	rateMS int
	log    interface {
		Info(string, ...any)
		Error(string, ...any)
		Warn(string, ...any)
	}
}

func main() {
	log := logx.New("broadcasts")
	ctx := context.Background()

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
		st:     &store{pool: pool},
		bus:    bus,
		rateMS: config.GetInt("BROADCAST_RATE_MS", 40),
		log:    log,
	}

	if err := bus.Subscribe(events.SubjectBroadcastRequested, "broadcasts", a.onBroadcast); err != nil {
		log.Error("subscribe failed", "err", err)
		os.Exit(1)
	}
	log.Info("broadcasts ready", "rate_ms", a.rateMS)

	go func() {
		mux := http.NewServeMux()
		mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200); _, _ = w.Write([]byte("ok")) })
		_ = http.ListenAndServe(":8084", mux)
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	log.Info("broadcasts stopped")
}

func (a *app) onBroadcast(env events.Envelope) error {
	var e events.BroadcastRequested
	if err := json.Unmarshal(env.Data, &e); err != nil {
		a.log.Warn("decode broadcast", "err", err)
		return nil
	}
	ctx := context.Background()

	b, err := a.st.getBroadcast(ctx, e.BroadcastID)
	if err != nil {
		return err
	}
	if b.Status != "queued" && b.Status != "sending" {
		a.log.Warn("broadcast bukan queued, dilewati", "id", b.ID, "status", b.Status)
		return nil
	}
	if err := a.st.markSending(ctx, b.ID); err != nil {
		return err
	}

	recips, err := a.st.pendingRecipients(ctx, b.ID)
	if err != nil {
		return err
	}
	channelID := ""
	if b.ChannelID != nil {
		channelID = *b.ChannelID
	}

	a.log.Info("broadcast mulai", "id", b.ID, "recipients", len(recips))
	for _, r := range recips {
		out := events.MessageOutbound{
			ContactID:  r.ContactID,
			ChannelID:  channelID,
			SenderType: "system",
			Type:       "text",
			Body:       b.Body,
		}
		if err := a.bus.Publish(events.SubjectMessageOutbound, b.OrgID, out); err != nil {
			a.log.Error("publish outbound failed", "recip", r.ID, "err", err)
			continue
		}
		_ = a.st.markRecipientSent(ctx, r.ID)
		_ = a.st.bumpSent(ctx, b.ID)
		// throttle (rate limit) agar tidak membanjiri channel/Meta
		time.Sleep(time.Duration(a.rateMS) * time.Millisecond)
	}

	if err := a.st.complete(ctx, b.ID); err != nil {
		return err
	}
	a.log.Info("broadcast selesai", "id", b.ID, "sent", len(recips))
	return nil
}
