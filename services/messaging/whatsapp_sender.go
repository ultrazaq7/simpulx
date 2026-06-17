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
)

// sender mengirim pesan ke WhatsApp Cloud API. Saat mock=true (dev), tidak
// benar-benar memanggil Meta — mengembalikan wamid palsu agar slice bisa diuji.
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
