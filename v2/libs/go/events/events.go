// Package events mendefinisikan kontrak event JSON yang dipublish ke NATS.
// Lihat proto/events.md untuk dokumentasi payload.
package events

import (
	"encoding/json"
	"time"
)

// Subjects NATS (stream EVENTS, subjects events.>).
const (
	SubjectMessageReceived      = "events.message.received"
	SubjectMessagePersisted     = "events.message.persisted"
	SubjectMessageOutbound      = "events.message.outbound"
	SubjectMessageStatusUpdated = "events.message.status.updated"
	SubjectConversationHandoff  = "events.conversation.handoff"
	SubjectConversationAssigned = "events.conversation.assigned"
	SubjectConversationClosed   = "events.conversation.closed"
	SubjectBroadcastRequested   = "events.broadcast.requested"

	StreamName     = "EVENTS"
	StreamSubjects = "events.>"
)

// Envelope adalah amplop umum semua event.
type Envelope struct {
	ID    string          `json:"id"`
	Type  string          `json:"type"`
	OrgID string          `json:"org_id"`
	TS    time.Time       `json:"ts"`
	Data  json.RawMessage `json:"data"`
}

// ── Payload per tipe ────────────────────────────────────────

type InboundMessage struct {
	ExternalID string `json:"external_id"`
	Type       string `json:"type"`
	Text       string `json:"text"`
	MediaURL   string `json:"media_url,omitempty"`
}

type MessageReceived struct {
	Channel       string          `json:"channel"`
	PhoneNumberID string          `json:"phone_number_id"`
	From          string          `json:"from"`
	ContactName   string          `json:"contact_name"`
	// Referral carries the CTWA ad source_id when the contact arrived from a
	// click-to-WhatsApp ad. Used for campaign attribution. Empty otherwise.
	Referral string         `json:"referral,omitempty"`
	Message  InboundMessage `json:"message"`
	Raw      json.RawMessage `json:"raw,omitempty"`
}

type MessagePersisted struct {
	ConversationID string `json:"conversation_id"`
	ContactID      string `json:"contact_id"`
	MessageID      string `json:"message_id"`
	Direction      string `json:"direction"`
	SenderType     string `json:"sender_type"`
	Type           string `json:"type"`
	Body           string `json:"body"`
	MediaURL       string `json:"media_url,omitempty"`
	Preview        string `json:"preview"`
}

type MessageStatusUpdated struct {
	ExternalID string `json:"external_id"`
	Status     string `json:"status"`
	Timestamp  string `json:"timestamp"`
}

type MessageOutbound struct {
	ConversationID string `json:"conversation_id"`
	// Untuk broadcast: kirim ke kontak yang mungkin belum punya percakapan.
	// Bila ConversationID kosong tetapi ContactID diisi, messaging akan
	// find/create percakapan untuk kontak via ChannelID.
	ContactID  string `json:"contact_id,omitempty"`
	ChannelID  string `json:"channel_id,omitempty"`
	SenderType string `json:"sender_type"`
	SenderID   string `json:"sender_id,omitempty"`
	Type       string `json:"type"`
	Body       string `json:"body"`
	MediaURL   string `json:"media_url,omitempty"`
}

type BroadcastRequested struct {
	BroadcastID string `json:"broadcast_id"`
}

type ConversationHandoff struct {
	ConversationID string  `json:"conversation_id"`
	Reason         string  `json:"reason"`
	Confidence     float64 `json:"confidence"`
}

type ConversationAssigned struct {
	ConversationID string `json:"conversation_id"`
	AgentID        string `json:"agent_id"`
	AgentName      string `json:"agent_name"`
	DepartmentID   string `json:"department_id,omitempty"`
}

type ConversationClosed struct {
	ConversationID string `json:"conversation_id"`
	Reason         string `json:"reason"`
}
