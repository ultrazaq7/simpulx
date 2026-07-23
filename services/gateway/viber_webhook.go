package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"

	"github.com/simpulx/v2/libs/go/events"
)

// Viber Public Account webhook. Inbound messages arrive here after a channel is
// connected via handleConnectViber, which registers /webhook/viber/{id} with
// Viber. The channel id in the path identifies which Public Account (and org)
// the event belongs to - Viber's payload doesn't carry the PA id itself.

type viberWebhook struct {
	Event  string `json:"event"` // message | conversation_started | subscribed | webhook | ...
	Sender struct {
		ID     string `json:"id"`
		Name   string `json:"name"`
		Avatar string `json:"avatar"`
	} `json:"sender"`
	Message *struct {
		Type         string `json:"type"` // text | picture | video | file | ...
		Text         string `json:"text"`
		Media        string `json:"media"`
		TrackingData string `json:"tracking_data"`
	} `json:"message"`
	MessageToken json.Number `json:"message_token"`
}

func (s *server) handleViber(w http.ResponseWriter, r *http.Request) {
	// Viber only POSTs JSON callbacks; respond 200 so it never retries a parsed event.
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusOK)
		return
	}
	var p viberWebhook
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		s.log.Warn("bad viber webhook payload", "err", err)
		w.WriteHeader(http.StatusOK)
		return
	}
	s.ingestViber(r.Context(), r.PathValue("id"), p)
	w.WriteHeader(http.StatusOK)
}

func (s *server) ingestViber(ctx context.Context, channelID string, p viberWebhook) {
	if p.Event != "message" || p.Message == nil {
		return // subscribed / conversation_started / webhook-verification / delivery, etc.
	}
	orgID, err := s.resolveOrgByViber(ctx, channelID)
	if err != nil {
		s.log.Warn("unknown viber channel", "channel", channelID, "err", err)
		return
	}

	msgType, mediaURL := "text", ""
	switch p.Message.Type {
	case "picture":
		msgType, mediaURL = "image", p.Message.Media
	case "video":
		msgType, mediaURL = "video", p.Message.Media
	case "file":
		msgType, mediaURL = "document", p.Message.Media
	}

	raw, _ := json.Marshal(p)
	evt := events.MessageReceived{
		Channel:       "viber",
		PhoneNumberID: channelID, // resolving key for messaging.resolveChannel
		From:          p.Sender.ID,
		ContactName:   p.Sender.Name,
		Message: events.InboundMessage{
			ExternalID: p.MessageToken.String(),
			Type:       msgType,
			Text:       p.Message.Text,
			MediaURL:   mediaURL,
		},
		Raw: raw,
	}
	if err := s.bus.Publish(events.SubjectMessageReceived, orgID, evt); err != nil {
		s.log.Error("publish viber failed", "err", err)
		return
	}
	s.log.Info("viber message.received published", "org", orgID, "channel", channelID, "from", p.Sender.ID)
}

func (s *server) resolveOrgByViber(ctx context.Context, channelID string) (string, error) {
	var orgID string
	err := s.pool.QueryRow(ctx,
		`SELECT organization_id FROM channels
		  WHERE id = $1 AND type = 'viber' AND is_active
		  LIMIT 1`, channelID).Scan(&orgID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", errors.New("no viber channel for id")
	}
	return orgID, err
}
