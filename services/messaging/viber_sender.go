package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/google/uuid"
)

// viberSender mengirim pesan keluar ke Viber Public Account REST API. Saat
// mock=true (dev) atau kredensial kosong, mengembalikan token palsu agar alur
// outbound bisa diuji tanpa benar-benar memanggil Viber.
type viberSender struct {
	mock bool
	http *http.Client
}

func newViberSender(mock bool) *viberSender {
	return &viberSender{mock: mock, http: &http.Client{Timeout: 15 * time.Second}}
}

// send mengirim teks atau media ke satu user Viber. Mengembalikan message_token.
// Viber mewajibkan "size" untuk video/file yang tidak kita simpan, jadi media
// selain gambar dikirim sebagai tautan teks (best-effort, jujur).
func (v *viberSender) send(ctx context.Context, t sendTarget, msgType, body, mediaURL string) (string, error) {
	if v.mock || t.AccessToken == "" || t.ExternalID == "" {
		return "viber.MOCK-" + uuid.NewString(), nil
	}

	name := t.ChannelName
	if name == "" {
		name = "Simpulx"
	}
	if len(name) > 28 { // Viber sender name limit
		name = name[:28]
	}

	payload := map[string]any{
		"receiver": t.ExternalID,
		"sender":   map[string]any{"name": name},
	}
	switch {
	case msgType == "image" && mediaURL != "":
		payload["type"] = "picture"
		payload["media"] = mediaURL
		payload["text"] = body // optional caption
	case mediaURL != "" && (msgType == "video" || msgType == "audio" || msgType == "document"):
		text := body
		if text != "" {
			text += "\n"
		}
		payload["type"] = "text"
		payload["text"] = text + mediaURL
	default:
		payload["type"] = "text"
		payload["text"] = body
	}

	buf, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://chatapi.viber.com/pa/send_message", bytes.NewReader(buf))
	if err != nil {
		return "", err
	}
	req.Header.Set("X-Viber-Auth-Token", t.AccessToken)
	req.Header.Set("Content-Type", "application/json")
	resp, err := v.http.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("viber send failed: %d %s", resp.StatusCode, string(respBody))
	}
	var out struct {
		Status        int         `json:"status"`
		StatusMessage string      `json:"status_message"`
		MessageToken  json.Number `json:"message_token"`
	}
	_ = json.Unmarshal(respBody, &out)
	if out.Status != 0 {
		return "", fmt.Errorf("viber: %s", out.StatusMessage)
	}
	return out.MessageToken.String(), nil
}
