// Package broker membungkus NATS JetStream untuk publish/subscribe event.
package broker

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/nats-io/nats.go"

	"github.com/simpulx/v2/libs/go/events"
)

type Broker struct {
	nc *nats.Conn
	js nats.JetStreamContext
}

// Connect membuka koneksi NATS dan memastikan stream EVENTS ada.
func Connect(url string) (*Broker, error) {
	nc, err := nats.Connect(url,
		nats.RetryOnFailedConnect(true),
		nats.MaxReconnects(-1),
		nats.ReconnectWait(time.Second),
	)
	if err != nil {
		return nil, fmt.Errorf("nats connect: %w", err)
	}
	js, err := nc.JetStream()
	if err != nil {
		return nil, fmt.Errorf("jetstream: %w", err)
	}
	// Idempotent: buat stream bila belum ada.
	_, err = js.AddStream(&nats.StreamConfig{
		Name:      events.StreamName,
		Subjects:  []string{events.StreamSubjects},
		Retention: nats.LimitsPolicy,
		MaxAge:    7 * 24 * time.Hour,
		Storage:   nats.FileStorage,
	})
	if err != nil && err != nats.ErrStreamNameAlreadyInUse {
		// AddStream pada stream eksisting dgn config sama bisa mengembalikan error;
		// abaikan bila stream sudah ada.
		if _, infoErr := js.StreamInfo(events.StreamName); infoErr != nil {
			return nil, fmt.Errorf("add stream: %w", err)
		}
	}
	return &Broker{nc: nc, js: js}, nil
}

// Publish mengirim event ber-amplop. Bila orgID/data sudah disediakan caller,
// fungsi mengisi id & ts otomatis.
func (b *Broker) Publish(subject, orgID string, payload any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	env := events.Envelope{
		ID:    uuid.NewString(),
		Type:  subjectToType(subject),
		OrgID: orgID,
		TS:    time.Now().UTC(),
		Data:  data,
	}
	raw, err := json.Marshal(env)
	if err != nil {
		return err
	}
	_, err = b.js.Publish(subject, raw)
	return err
}

// Subscribe membuat durable queue consumer. handler menerima envelope yang
// sudah ter-decode; kembalikan error untuk Nak (redelivery).
func (b *Broker) Subscribe(subject, durable string, handler func(events.Envelope) error) error {
	_, err := b.js.QueueSubscribe(subject, durable, func(m *nats.Msg) {
		var env events.Envelope
		if err := json.Unmarshal(m.Data, &env); err != nil {
			_ = m.Term() // payload rusak, jangan redeliver
			return
		}
		if err := handler(env); err != nil {
			_ = m.Nak()
			return
		}
		_ = m.Ack()
	},
		nats.Durable(durable),
		nats.ManualAck(),
		nats.AckWait(30*time.Second),
		nats.DeliverAll(),
	)
	return err
}

func (b *Broker) Close() { b.nc.Close() }

func subjectToType(subject string) string {
	// "events.message.received" -> "message.received"
	if len(subject) > len("events.") {
		return subject[len("events."):]
	}
	return subject
}
