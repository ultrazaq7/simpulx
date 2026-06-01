package main

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
	MessagingProduct string       `json:"messaging_product"`
	Metadata         waMetadata   `json:"metadata"`
	Contacts         []waContact  `json:"contacts"`
	Messages         []waMessage  `json:"messages"`
	Statuses         []waStatus   `json:"statuses"`
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
	Image    *waMedia `json:"image"`
	Audio    *waMedia `json:"audio"`
	Video    *waMedia `json:"video"`
	Document *waMedia `json:"document"`
	// Present when the contact came from a Click-to-WhatsApp ad.
	Referral *struct {
		SourceID   string `json:"source_id"`
		SourceType string `json:"source_type"`
		SourceURL  string `json:"source_url"`
		CtwaClid   string `json:"ctwa_clid"`
	} `json:"referral"`
}

// referralSourceID returns the CTWA ad source_id when present.
func (m waMessage) referralSourceID() string {
	if m.Referral != nil {
		return m.Referral.SourceID
	}
	return ""
}

type waMedia struct {
	ID       string `json:"id"`
	MimeType string `json:"mime_type"`
	Caption  string `json:"caption"`
	Link     string `json:"link"` // direct URL when available (test payloads); real Meta uses ID
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
	}
	return ""
}
