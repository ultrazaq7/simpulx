package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"github.com/google/uuid"

	"github.com/simpulx/v2/libs/go/events"
)

// sender mengirim pesan ke WhatsApp Cloud API. Saat mock=true (dev), tidak
// benar-benar memanggil Meta - mengembalikan wamid palsu agar slice bisa diuji.
type sender struct {
	mock     bool
	graphURL string
	http     *http.Client
}

func newSender(mock bool, graphBase string) *sender {
	return &sender{
		mock:     mock,
		graphURL: graphBase,
		http:     &http.Client{Timeout: 15 * time.Second},
	}
}

// sendText mengirim pesan teks. Mengembalikan external id (wamid).
func (s *sender) sendText(ctx context.Context, t sendTarget, body string) (string, error) {
	return s.post(ctx, t, map[string]any{
		"messaging_product": "whatsapp",
		"to":                t.ContactPhone,
		"type":              "text",
		"text":              map[string]string{"body": body},
	})
}

// sendTemplate mengirim pesan template WhatsApp (name + language). Dipakai node
// automation "Send template" - juga satu-satunya cara mengirim di luar 24 jam.
func (s *sender) sendTemplate(ctx context.Context, t sendTarget, name, lang string) (string, error) {
	return s.sendTemplateParams(ctx, t, &events.TemplateOutbound{Name: name, Language: lang})
}

// sendTemplateParams mengirim template HSM dengan komponen (body variables +
// optional header media/text), sehingga agent bisa initiate chat dengan isian
// {{1}}..{{n}}. Meng-generalisasi sendTemplate lama.
func (s *sender) sendTemplateParams(ctx context.Context, t sendTarget, tpl *events.TemplateOutbound) (string, error) {
	lang := tpl.Language
	if lang == "" {
		lang = "en"
	}
	tmpl := map[string]any{
		"name":     tpl.Name,
		"language": map[string]string{"code": lang},
	}

	var components []map[string]any
	// Header component (media or text variable).
	switch tpl.HeaderType {
	case "IMAGE", "VIDEO", "DOCUMENT":
		if tpl.HeaderMediaURL != "" {
			key := map[string]string{"IMAGE": "image", "VIDEO": "video", "DOCUMENT": "document"}[tpl.HeaderType]
			components = append(components, map[string]any{
				"type": "header",
				"parameters": []map[string]any{
					{"type": key, key: map[string]string{"link": tpl.HeaderMediaURL}},
				},
			})
		}
	case "TEXT":
		if tpl.HeaderParam != "" {
			components = append(components, map[string]any{
				"type":       "header",
				"parameters": []map[string]any{{"type": "text", "text": tpl.HeaderParam}},
			})
		}
	}
	// Body variables {{1}}..{{n}}.
	if len(tpl.BodyParams) > 0 {
		params := make([]map[string]any, 0, len(tpl.BodyParams))
		for _, p := range tpl.BodyParams {
			params = append(params, map[string]any{"type": "text", "text": p})
		}
		components = append(components, map[string]any{"type": "body", "parameters": params})
	}
	if len(components) > 0 {
		tmpl["components"] = components
	}

	return s.post(ctx, t, map[string]any{
		"messaging_product": "whatsapp",
		"to":                t.ContactPhone,
		"type":              "template",
		"template":          tmpl,
	})
}

// sendMedia mengirim pesan media (image/audio/video/document) via link.
// WhatsApp Cloud API menerima media dengan URL publik (atau media id upload).
func (s *sender) sendMedia(ctx context.Context, t sendTarget, msgType, mediaURL, caption string) (string, error) {
	if msgType != "image" && msgType != "audio" && msgType != "video" && msgType != "document" {
		msgType = "document"
	}
	obj := map[string]string{"link": mediaURL}
	if caption != "" && msgType != "audio" { // audio tidak punya caption
		obj["caption"] = caption
	}
	if msgType == "document" {
		if parsed, err := url.Parse(mediaURL); err == nil {
			if name := parsed.Query().Get("name"); name != "" {
				obj["filename"] = name
			}
		}
	}
	return s.post(ctx, t, map[string]any{
		"messaging_product": "whatsapp",
		"to":                t.ContactPhone,
		"type":              msgType,
		msgType:             obj,
	})
}

// sendFlow mengirim interactive WhatsApp Flow (Form) message.
func (s *sender) sendFlow(ctx context.Context, t sendTarget, metaFlowID, flowToken, cta, body string) (string, error) {
	if cta == "" {
		cta = "Open form"
	}
	if body == "" {
		body = "Please fill in this form"
	}
	return s.post(ctx, t, map[string]any{
		"messaging_product": "whatsapp",
		"to":                t.ContactPhone,
		"type":              "interactive",
		"interactive": map[string]any{
			"type": "flow",
			"body": map[string]string{"text": body},
			"action": map[string]any{
				"name": "flow",
				"parameters": map[string]any{
					"flow_message_version": "3",
					"flow_token":           flowToken,
					"flow_id":              metaFlowID,
					"flow_cta":             cta,
					"flow_action":          "navigate",
				},
			},
		},
	})
}

// sendInteractive mengirim pesan interactive WhatsApp: reply buttons (max 3) atau
// list. Dipakai node automation "auto reply" untuk balasan berkancing/menu.
func (s *sender) sendInteractive(ctx context.Context, t sendTarget, p *events.InteractiveOutbound) (string, error) {
	if p == nil || p.Body == "" {
		return "", fmt.Errorf("interactive: empty body")
	}
	interactive := map[string]any{"body": map[string]string{"text": p.Body}}
	// Header can be an image (so an auto-reply combines an image + buttons/list
	// in one message) or plain text.
	if p.HeaderType == "image" && p.HeaderImageURL != "" {
		interactive["header"] = map[string]any{"type": "image", "image": map[string]string{"link": p.HeaderImageURL}}
	} else if p.Header != "" {
		interactive["header"] = map[string]any{"type": "text", "text": p.Header}
	}
	if p.Footer != "" {
		interactive["footer"] = map[string]string{"text": p.Footer}
	}
	switch p.Type {
	case "list":
		sections := make([]map[string]any, 0, len(p.Sections))
		for _, sec := range p.Sections {
			rows := make([]map[string]any, 0, len(sec.Rows))
			for _, r := range sec.Rows {
				row := map[string]any{"id": r.ID, "title": r.Title}
				if r.Description != "" {
					row["description"] = r.Description
				}
				rows = append(rows, row)
			}
			if len(rows) == 0 {
				continue
			}
			section := map[string]any{"rows": rows}
			if sec.Title != "" {
				section["title"] = sec.Title
			}
			sections = append(sections, section)
		}
		if len(sections) == 0 {
			return "", fmt.Errorf("interactive list: no rows")
		}
		btn := p.ButtonText
		if btn == "" {
			btn = "Menu"
		}
		interactive["type"] = "list"
		interactive["action"] = map[string]any{"button": btn, "sections": sections}
	case "location_request":
		interactive["type"] = "location_request_message"
		interactive["action"] = map[string]any{"name": "send_location"}
	default: // buttons
		btns := make([]map[string]any, 0, len(p.Buttons))
		for _, b := range p.Buttons {
			if b.Title == "" {
				continue
			}
			id := b.ID
			if id == "" {
				id = b.Title
			}
			btns = append(btns, map[string]any{"type": "reply", "reply": map[string]string{"id": id, "title": b.Title}})
		}
		if len(btns) == 0 {
			return "", fmt.Errorf("interactive buttons: none")
		}
		interactive["type"] = "button"
		interactive["action"] = map[string]any{"buttons": btns}
	}
	return s.post(ctx, t, map[string]any{
		"messaging_product": "whatsapp",
		"to":                t.ContactPhone,
		"type":              "interactive",
		"interactive":       interactive,
	})
}

// post mengirim payload ke WA Cloud API. Saat mock/kredensial kosong,
// mengembalikan wamid palsu agar slice bisa diuji offline.
func (s *sender) post(ctx context.Context, t sendTarget, payload map[string]any) (string, error) {
	if s.mock || t.PhoneNumberID == "" || t.AccessToken == "" {
		return "wamid.MOCK-" + uuid.NewString(), nil
	}
	url := fmt.Sprintf("%s/%s/messages", s.graphURL, t.PhoneNumberID)
	buf, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(buf))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+t.AccessToken)
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.http.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("wa send failed: %d %s", resp.StatusCode, string(respBody))
	}
	var out struct {
		Messages []struct {
			ID string `json:"id"`
		} `json:"messages"`
	}
	_ = json.Unmarshal(respBody, &out)
	if len(out.Messages) > 0 {
		return out.Messages[0].ID, nil
	}
	return "", nil
}
