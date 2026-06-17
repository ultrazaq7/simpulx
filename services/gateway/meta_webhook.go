package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"

	"github.com/simpulx/v2/libs/go/events"
)

// Meta (Facebook Messenger + Instagram) webhook. Mirrors the WhatsApp
// webhook but for page/instagram messaging events: the sender is a PSID
// (page-scoped id) with no phone number, and the channel is resolved by
// the page id / instagram account id stored in channels.config.

type metaWebhook struct {
	Object string `json:"object"` // "page" (messenger) | "instagram"
	Entry  []struct {
		ID        string `json:"id"` // page id / ig business account id
		Messaging []struct {
			Sender  struct{ ID string `json:"id"` } `json:"sender"`
			Message *struct {
				Mid         string `json:"mid"`
				Text        string `json:"text"`
				Attachments []struct {
					Type    string `json:"type"`
					Payload struct {
						URL string `json:"url"`
					} `json:"payload"`
				} `json:"attachments"`
			} `json:"message"`
		} `json:"messaging"`
	} `json:"entry"`
}

func (s *server) handleMeta(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		q := r.URL.Query()
		if q.Get("hub.mode") == "subscribe" && q.Get("hub.verify_token") == s.verifyToken {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(q.Get("hub.challenge")))
			return
		}
		http.Error(w, "forbidden", http.StatusForbidden)
	case http.MethodPost:
		var p metaWebhook
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			s.log.Warn("bad meta webhook payload", "err", err)
			w.WriteHeader(http.StatusOK) // 200 so Meta doesn't retry a broken payload
			return
		}
		s.ingestMeta(r.Context(), p)
		w.WriteHeader(http.StatusOK)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *server) ingestMeta(ctx context.Context, p metaWebhook) {
	channel := "messenger"
	if p.Object == "instagram" {
		channel = "instagram"
	}
	for _, entry := range p.Entry {
		orgID, err := s.resolveOrgByMeta(ctx, entry.ID)
		if err != nil {
			s.log.Warn("unknown meta channel", "ref", entry.ID, "err", err)
			continue
		}
		for _, m := range entry.Messaging {
			if m.Message == nil {
				continue // delivery/read receipts, echoes, etc.
			}
			msgType, mediaURL := "text", ""
			if len(m.Message.Attachments) > 0 {
				att := m.Message.Attachments[0]
				mediaURL = att.Payload.URL
				switch att.Type {
				case "image":
					msgType = "image"
				case "video":
					msgType = "video"
				case "audio":
					msgType = "audio"
				default:
					msgType = "document"
				}
			}
			raw, _ := json.Marshal(m)
			evt := events.MessageReceived{
				Channel:       channel,
				PhoneNumberID: entry.ID, // resolving key for messaging.resolveChannel
				From:          m.Sender.ID,
				Message: events.InboundMessage{
					ExternalID: m.Message.Mid,
					Type:       msgType,
					Text:       m.Message.Text,
					MediaURL:   mediaURL,
				},
				Raw: raw,
			}
			if err := s.bus.Publish(events.SubjectMessageReceived, orgID, evt); err != nil {
				s.log.Error("publish meta failed", "err", err)
				continue
			}
			s.log.Info("meta message.received published", "org", orgID, "channel", channel, "from", m.Sender.ID)
		}
	}
}

func (s *server) resolveOrgByMeta(ctx context.Context, externalID string) (string, error) {
	var orgID string
	err := s.pool.QueryRow(ctx,
		`SELECT organization_id FROM channels
		  WHERE is_active AND (phone_number_id = $1 OR config->>'page_id' = $1 OR config->>'instagram_account_id' = $1)
		  LIMIT 1`, externalID).Scan(&orgID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", errors.New("no channel for meta id")
	}
	return orgID, err
}
