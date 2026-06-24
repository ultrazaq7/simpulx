package main

import (
	"encoding/json"
	"fmt"
	"strings"
)

// Struktur payload webhook WhatsApp Cloud API (subset yang dipakai).
type waWebhook struct {
	Object string    `json:"object"`
	Entry  []waEntry `json:"entry"`
}

type waEntry struct {
	ID      string     `json:"id"`
	Changes []waChange `json:"changes"`
}

type waChange struct {
	Field string  `json:"field"`
	Value waValue `json:"value"`
}

type waValue struct {
	MessagingProduct string          `json:"messaging_product"`
	Metadata         waMetadata      `json:"metadata"`
	Contacts         []waContact     `json:"contacts"`
	Messages         []waMessage     `json:"messages"`
	Statuses         []waStatus      `json:"statuses"`
	// Calls carries the raw "calls" array from the WhatsApp Business Calling API
	// webhook (field == "calls"). Kept raw so the call processor can decode the
	// full lifecycle shape (connect/terminate, SDP, direction, duration).
	Calls json.RawMessage `json:"calls"`

	// message_template_status_update webhook fields (field == that name).
	Event                   string      `json:"event"`
	MessageTemplateID       json.Number `json:"message_template_id"`
	MessageTemplateName     string      `json:"message_template_name"`
	MessageTemplateLanguage string      `json:"message_template_language"`
	Reason                  string      `json:"reason"`
}

type waStatus struct {
	ID        string `json:"id"`
	Status    string `json:"status"`
	Timestamp string `json:"timestamp"`
}

type waMetadata struct {
	DisplayPhoneNumber string `json:"display_phone_number"`
	PhoneNumberID      string `json:"phone_number_id"`
}

type waContact struct {
	WaID    string `json:"wa_id"`
	Profile struct {
		Name string `json:"name"`
	} `json:"profile"`
}

type waMessage struct {
	From      string `json:"from"`
	ID        string `json:"id"`
	Timestamp string `json:"timestamp"`
	Type      string `json:"type"`
	Text      struct {
		Body string `json:"body"`
	} `json:"text"`
	Image       *waMedia       `json:"image"`
	Audio       *waMedia       `json:"audio"`
	Video       *waMedia       `json:"video"`
	Document    *waMedia       `json:"document"`
	Sticker     *waMedia       `json:"sticker"`
	Button      *waButton      `json:"button"`
	Interactive *waInteractive `json:"interactive"`
	Template    *waTemplate    `json:"template"`
	// Present when the contact came from a Click-to-WhatsApp ad.
	Referral *struct {
		SourceID   string `json:"source_id"`
		SourceType string `json:"source_type"`
		SourceURL  string `json:"source_url"`
		CtwaClid   string `json:"ctwa_clid"`
	} `json:"referral"`
	// Errors hadir saat Meta tidak bisa men-decode pesan (type "unsupported",
	// mis. kode 131051). PENTING: dalam kasus ini Meta TIDAK menyertakan konten
	// asli pesan, hanya alasan error.
	Errors []struct {
		Code      int    `json:"code"`
		Title     string `json:"title"`
		Message   string `json:"message"`
		ErrorData struct {
			Details string `json:"details"`
		} `json:"error_data"`
	} `json:"errors"`
	// Context carries the message ID this message is replying to (e.g. the
	// call-permission request wamid). Used for accurate multi-thread routing.
	Context *struct {
		From      string `json:"from"`
		ID        string `json:"id"`
		MessageID string `json:"message_id"` // alias used by some webhook payloads
	} `json:"context"`
	// raw menyimpan JSON asli pesan apa adanya (diisi UnmarshalJSON), agar field
	// di luar struct (errors, tipe baru) tidak hilang saat decode.
	raw json.RawMessage `json:"-"`
}

// UnmarshalJSON menyimpan byte JSON asli pesan sebelum decode ke struct, supaya
// payload mentah tetap utuh untuk inspeksi (mis. pesan "unsupported").
func (m *waMessage) UnmarshalJSON(b []byte) error {
	type alias waMessage // hindari rekursi: alias tidak punya UnmarshalJSON
	var a alias
	if err := json.Unmarshal(b, &a); err != nil {
		return err
	}
	*m = waMessage(a)
	m.raw = append(json.RawMessage(nil), b...)
	return nil
}

// rawJSON mengembalikan JSON asli pesan; fallback ke marshal struct bila kosong
// (mis. pesan dibuat manual di test tanpa lewat UnmarshalJSON).
func (m waMessage) rawJSON() json.RawMessage {
	if len(m.raw) > 0 {
		return m.raw
	}
	b, _ := json.Marshal(m)
	return b
}

// errorSummary merangkai alasan singkat dari array errors Meta (pesan
// "unsupported"), mis. "131051 Message type unknown".
func (m waMessage) errorSummary() string {
	if len(m.Errors) == 0 {
		return ""
	}
	e := m.Errors[0]
	switch {
	case e.Title != "":
		return fmt.Sprintf("%d %s", e.Code, e.Title)
	case e.Message != "":
		return fmt.Sprintf("%d %s", e.Code, e.Message)
	default:
		return fmt.Sprintf("code %d", e.Code)
	}
}

// referralSourceID returns the CTWA ad source_id when present.
func (m waMessage) referralSourceID() string {
	if m.Referral != nil {
		return m.Referral.SourceID
	}
	return ""
}

// referralSourceURL returns the CTWA ad source URL (real ad link) when present.
func (m waMessage) referralSourceURL() string {
	if m.Referral != nil {
		return m.Referral.SourceURL
	}
	return ""
}

type waMedia struct {
	ID       string `json:"id"`
	MimeType string `json:"mime_type"`
	Caption  string `json:"caption"`
	Link     string `json:"link"` // direct URL when available (test payloads); real Meta uses ID
	Animated bool   `json:"animated"` // for stickers
}

type waButton struct {
	Payload string `json:"payload"`
	Text    string `json:"text"`
}

type waInteractive struct {
	Type        string `json:"type"`
	ButtonReply struct {
		ID    string `json:"id"`
		Title string `json:"title"`
	} `json:"button_reply"`
	ListReply struct {
		ID          string `json:"id"`
		Title       string `json:"title"`
		Description string `json:"description"`
	} `json:"list_reply"`
	// Customer's reply to a call-permission request (taps Allow / Don't allow).
	CallPermissionReply struct {
		Response string `json:"response"` // accept | reject (best-effort)
	} `json:"call_permission_reply"`
}

type waTemplate struct {
	Name string `json:"name"`
}

// extractMediaURL returns a direct media URL when the payload provides one.
// For real Meta media (ID only), downloading is handled downstream.
func (m waMessage) extractMediaURL() string {
	switch m.Type {
	case "image":
		if m.Image != nil {
			return m.Image.Link
		}
	case "audio":
		if m.Audio != nil {
			return m.Audio.Link
		}
	case "video":
		if m.Video != nil {
			return m.Video.Link
		}
	case "document":
		if m.Document != nil {
			return m.Document.Link
		}
	case "sticker":
		if m.Sticker != nil {
			return m.Sticker.Link
		}
	}
	return ""
}

// mediaID returns the Meta media id for media messages (real Meta sends an id,
// not a link). Used to download + re-host the media.
func (m waMessage) mediaID() string {
	switch m.Type {
	case "image":
		if m.Image != nil {
			return m.Image.ID
		}
	case "audio":
		if m.Audio != nil {
			return m.Audio.ID
		}
	case "video":
		if m.Video != nil {
			return m.Video.ID
		}
	case "document":
		if m.Document != nil {
			return m.Document.ID
		}
	case "sticker":
		if m.Sticker != nil {
			return m.Sticker.ID
		}
	}
	return ""
}

// extractText mengambil body teks atau caption media.
func (m waMessage) extractText() string {
	switch m.Type {
	case "text":
		return m.Text.Body
	case "image":
		if m.Image != nil {
			return m.Image.Caption
		}
	case "video":
		if m.Video != nil {
			return m.Video.Caption
		}
	case "document":
		if m.Document != nil {
			return m.Document.Caption
		}
	case "button":
		if m.Button != nil {
			// Authentication/OTP template: kode OTP ada di Payload,
			// sementara Text hanya label tombol (mis. "Copy code").
			// Tampilkan payload (kode OTP) agar terbaca di inbox.
			if m.Button.Payload != "" && m.Button.Text != "" && m.Button.Payload != m.Button.Text {
				return m.Button.Text + "\n" + m.Button.Payload
			}
			if m.Button.Payload != "" {
				return m.Button.Payload
			}
			return m.Button.Text
		}
	case "interactive":
		if m.Interactive != nil {
			switch m.Interactive.Type {
			case "button_reply":
				return m.Interactive.ButtonReply.Title
			case "list_reply":
				return m.Interactive.ListReply.Title
			case "call_permission_reply":
				switch strings.ToLower(m.Interactive.CallPermissionReply.Response) {
				case "accept", "allow", "approved", "granted":
					return "Allowed WhatsApp call"
				case "reject", "deny", "declined", "decline":
					return "Declined WhatsApp call"
				default:
					return "Call permission reply"
				}
			case "nfm_reply":
				return "Form submitted"
			}
		}
	case "template":
		if m.Template != nil {
			return m.Template.Name
		}
	case "unsupported":
		// Meta tidak bisa men-decode pesan ini; konten asli TIDAK dikirim.
		// Tampilkan penanda (+ alasan) agar tidak blank "No messages yet".
		if r := m.errorSummary(); r != "" {
			return "[unsupported message: " + r + "]"
		}
		return "[unsupported message]"
	}
	return ""
}

// buttonPayload returns the callback id behind a tapped quick-reply / template
// button (interactive button_reply id, or a legacy button payload). This is the
// unique id a broadcast can generate per recipient; empty for normal messages.
func (m waMessage) buttonPayload() string {
	switch m.Type {
	case "interactive":
		if m.Interactive != nil {
			if m.Interactive.Type == "button_reply" && m.Interactive.ButtonReply.ID != "" {
				return m.Interactive.ButtonReply.ID
			}
			if m.Interactive.Type == "list_reply" && m.Interactive.ListReply.ID != "" {
				return m.Interactive.ListReply.ID
			}
		}
	case "button":
		if m.Button != nil {
			return m.Button.Payload
		}
	}
	return ""
}
