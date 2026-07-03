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
	SubjectConversationUpdated  = "events.conversation.updated"
	SubjectContactDeleted       = "events.contact.deleted"
	SubjectBroadcastRequested   = "events.broadcast.requested"
	SubjectAgentDeactivated     = "events.agent.deactivated"
	SubjectAuditCreated         = "events.audit.created"
	SubjectCallUpdated          = "events.call.updated"
	SubjectNotificationCreated  = "events.notification.created"
	SubjectSendForm             = "events.cmd.send_form" // AI nurture -> auto-send a WA intake form
	// AI follow-up trigger. MUST stay under events.> so the JetStream EVENTS stream
	// captures it and the ai-agent consumer (subscribed on "events.ai.draft_followup")
	// receives it. A prior "cmd.ai.draft_followup" value silently failed to publish
	// (no stream matched the subject) so 4h auto follow-ups never fired.
	SubjectCmdAIDraftFollowup = "events.ai.draft_followup"

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
	// ButtonPayload carries the quick-reply / interactive button callback id
	// (e.g. a broadcast-generated callback) when the contact taps a template
	// button. Empty for normal messages. Drives the button_click automation
	// trigger + broadcast click tracking.
	ButtonPayload string `json:"button_payload,omitempty"`
}

type MessageReceived struct {
	Channel       string `json:"channel"`
	PhoneNumberID string `json:"phone_number_id"`
	From          string `json:"from"`
	ContactName   string `json:"contact_name"`
	// Referral carries the CTWA ad source_id when the contact arrived from a
	// click-to-WhatsApp ad. Used for campaign attribution. Empty otherwise.
	Referral string `json:"referral,omitempty"`
	// ReferralURL is the CTWA ad's source URL (the real ad link), when present.
	ReferralURL string `json:"referral_url,omitempty"`
	// CTWA creative preview fields, when Meta includes them in the referral object
	// (image/video ads). Captured so the ad creative can be previewed in-app.
	ReferralImageURL  string          `json:"referral_image_url,omitempty"`
	ReferralHeadline  string          `json:"referral_headline,omitempty"`
	ReferralBody      string          `json:"referral_body,omitempty"`
	ReferralMediaType string          `json:"referral_media_type,omitempty"`
	Message           InboundMessage  `json:"message"`
	Raw               json.RawMessage `json:"raw,omitempty"`
}

type MessagePersisted struct {
	ConversationID  string  `json:"conversation_id"`
	ContactID       string  `json:"contact_id"`
	MessageID       string  `json:"message_id"`
	Direction       string  `json:"direction"`
	SenderType      string  `json:"sender_type"`
	Type            string  `json:"type"`
	Body            string  `json:"body"`
	MediaURL        string  `json:"media_url,omitempty"`
	Preview         string  `json:"preview"`
	AssignedAgentID *string `json:"assigned_agent_id,omitempty"`
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
	// Broadcast: id baris broadcast_recipients, agar messaging menautkan message
	// yang dibuat kembali ke penerima (laporan delivered/read yang akurat).
	BroadcastRecipientID string `json:"broadcast_recipient_id,omitempty"`
	// CallbackID: payload unik untuk tombol quick-reply template (mis.
	// "bc_<recipient_id>"). Pada pengiriman template asli ke Meta, dipasang sebagai
	// payload tiap tombol sehingga klik balasan bisa dilacak ke penerima broadcast.
	CallbackID string `json:"callback_id,omitempty"`
	// Interactive: when set, send a WhatsApp interactive message (reply buttons or
	// list) instead of plain text. Type should be "interactive".
	Interactive *InteractiveOutbound `json:"interactive,omitempty"`
	// Template: when set, send a real WhatsApp HSM template (with body variable
	// substitution). Used to (re)open a conversation with a contact. Type should
	// be "template"; Body carries a rendered preview for persistence/inbox.
	Template *TemplateOutbound `json:"template,omitempty"`
}

// ── Template (WhatsApp HSM) outbound payload ────────────────
// A real approved Meta template send with per-message variable values, so an
// agent can initiate a conversation outside the 24h window.
type TemplateOutbound struct {
	Name           string   `json:"name"`
	Language       string   `json:"language"`
	BodyParams     []string `json:"body_params,omitempty"`      // fills {{1}}..{{n}} in the body
	HeaderType     string   `json:"header_type,omitempty"`      // IMAGE | VIDEO | DOCUMENT | TEXT
	HeaderMediaURL string   `json:"header_media_url,omitempty"` // when header is media
	HeaderParam    string   `json:"header_param,omitempty"`     // TEXT header {{1}}
}

// ── Interactive (WhatsApp) outbound payloads ────────────────
// Carried on MessageOutbound.Interactive so an automation "auto reply" node can
// send reply-buttons or a list message, not just plain text.
type InteractiveButton struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

type InteractiveRow struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description,omitempty"`
}

type InteractiveSection struct {
	Title string           `json:"title,omitempty"`
	Rows  []InteractiveRow `json:"rows"`
}

type InteractiveOutbound struct {
	Type           string               `json:"type"` // "buttons" | "list"
	Header         string               `json:"header,omitempty"`
	HeaderType     string               `json:"header_type,omitempty"`      // "text" | "image"
	HeaderImageURL string               `json:"header_image_url,omitempty"` // when header_type=image
	Body           string               `json:"body"`
	Footer         string               `json:"footer,omitempty"`
	Buttons        []InteractiveButton  `json:"buttons,omitempty"`     // type=buttons (WA max 3)
	ButtonText     string               `json:"button_text,omitempty"` // type=list CTA label
	Sections       []InteractiveSection `json:"sections,omitempty"`    // type=list
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

// ContactDeleted is published when a contact (and its conversations) is deleted,
// so connected clients remove it from their lists in realtime.
type ContactDeleted struct {
	ContactID       string   `json:"contact_id"`
	ConversationIDs []string `json:"conversation_ids"`
}

// ConversationUpdated is broadcast when a conversation's stage, status,
// interest level, or disposition changes so every connected agent's UI
// refreshes in real time.
type ConversationUpdated struct {
	ConversationID string `json:"conversation_id"`
	Status         string `json:"status,omitempty"`
	StageID        string `json:"stage_id,omitempty"`
	InterestLevel  string `json:"interest_level,omitempty"`
	LostReason     string `json:"lost_reason,omitempty"`
	SnoozedUntil   string `json:"snoozed_until,omitempty"` // RFC3339, set on snooze
}

type CmdAIDraftFollowup struct {
	ConversationID string `json:"conversation_id"`
}

type AgentDeactivated struct {
	AgentID string `json:"agent_id"`
}

type AuditCreated struct {
	ConversationID string         `json:"conversation_id"`
	Type           string         `json:"type"`
	ActorType      string         `json:"actor_type"`
	ActorID        *string        `json:"actor_id,omitempty"`
	Detail         map[string]any `json:"detail"`
}

// NotificationCreated is published when a bell notification is written, so the
// gateway can also push it to the recipient's browser via FCM.
type NotificationCreated struct {
	UserID         string `json:"user_id"`
	Type           string `json:"type,omitempty"` // snooze_due | snooze_reminder | follow_up | ...
	Title          string `json:"title"`
	Body           string `json:"body"`
	ConversationID string `json:"conversation_id"`
}

// CallUpdated is broadcast whenever a call's state changes (permission
// granted, SDP answer received, call connected/ended, an inbound call ringing,
// etc). The realtime service relays this to the agent's WebSocket so the browser
// UI can react. For inbound (user-initiated) calls it also carries the SDP offer
// and the target agent so only the assigned agent's browser rings.
type CallUpdated struct {
	CallID           string `json:"call_id"`
	ConversationID   string `json:"conversation_id"`
	Direction        string `json:"direction,omitempty"` // inbound | outbound
	AgentID          string `json:"agent_id,omitempty"`  // inbound: assigned agent to ring (empty = any campaign agent)
	ContactName      string `json:"contact_name,omitempty"`
	ContactPhone     string `json:"contact_phone,omitempty"`
	PermissionStatus string `json:"permission_status"`
	CallStatus       string `json:"call_status"`
	SDPOffer         string `json:"sdp_offer,omitempty"`  // inbound: customer's WebRTC offer
	SDPAnswer        string `json:"sdp_answer,omitempty"` // outbound: customer's WebRTC answer
	EndReason        string `json:"end_reason,omitempty"`
	DurationSeconds  int    `json:"duration_seconds,omitempty"`
}
