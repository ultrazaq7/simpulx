package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/google/uuid"

	"github.com/simpulx/v2/libs/go/config"
)

// channelToken returns the WhatsApp access token for a phone_number_id.
func (s *server) channelToken(ctx context.Context, phoneNumberID string) string {
	var token string
	_ = s.pool.QueryRow(ctx,
		`SELECT COALESCE(access_token,'') FROM channels WHERE phone_number_id=$1 AND is_active LIMIT 1`,
		phoneNumberID).Scan(&token)
	return token
}

// downloadMetaMedia resolves a Meta media id to its short-lived URL, downloads
// the bytes (Bearer-authenticated), re-hosts them in object storage, and
// returns the public URL. Real Meta inbound media arrives as an id, not a link.
func (s *server) downloadMetaMedia(ctx context.Context, token, mediaID string) (string, error) {
	if s.storage == nil {
		return "", fmt.Errorf("storage not configured")
	}
	base := config.Get("WA_GRAPH_BASE", "https://graph.facebook.com/v21.0")

	// 1) media id -> short-lived URL + mime type
	metaReq, err := http.NewRequestWithContext(ctx, http.MethodGet, base+"/"+mediaID, nil)
	if err != nil {
		return "", err
	}
	metaReq.Header.Set("Authorization", "Bearer "+token)
	metaResp, err := s.httpClient.Do(metaReq)
	if err != nil {
		return "", err
	}
	defer metaResp.Body.Close()
	if metaResp.StatusCode >= 300 {
		return "", fmt.Errorf("media meta failed: %d", metaResp.StatusCode)
	}
	var meta struct {
		URL      string `json:"url"`
		MimeType string `json:"mime_type"`
	}
	if err := json.NewDecoder(metaResp.Body).Decode(&meta); err != nil || meta.URL == "" {
		return "", fmt.Errorf("media meta decode failed")
	}

	// 2) download the bytes (same bearer token required)
	dlReq, err := http.NewRequestWithContext(ctx, http.MethodGet, meta.URL, nil)
	if err != nil {
		return "", err
	}
	dlReq.Header.Set("Authorization", "Bearer "+token)
	dlResp, err := s.httpClient.Do(dlReq)
	if err != nil {
		return "", err
	}
	defer dlResp.Body.Close()
	if dlResp.StatusCode >= 300 {
		return "", fmt.Errorf("media download failed: %d", dlResp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(dlResp.Body, 25<<20)) // cap 25MB
	if err != nil {
		return "", err
	}
	ct := dlResp.Header.Get("Content-Type")
	if ct == "" {
		ct = meta.MimeType
	}
	return s.storage.put(ctx, "media/"+uuid.NewString(), ct, bytes.NewReader(data), int64(len(data)))
}
