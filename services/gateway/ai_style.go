package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"time"
)

// AI response tuning: the ai-agent owns the LLM work (reads the campaign's setup +
// calls Sonnet). The gateway only forwards the request with the caller's org scope,
// so a campaign can never be tuned/previewed across orgs.

// postAIAgent forwards a JSON body to an ai-agent path and relays its JSON response.
func (s *server) postAIAgent(w http.ResponseWriter, r *http.Request, path string, body any) {
	raw, _ := json.Marshal(body)
	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()
	upReq, err := http.NewRequestWithContext(ctx, http.MethodPost, s.aiAgentURL+path, bytes.NewReader(raw))
	if err != nil {
		http.Error(w, "request build failed", http.StatusInternalServerError)
		return
	}
	upReq.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(upReq)
	if err != nil {
		http.Error(w, "ai-agent unreachable", http.StatusUnprocessableEntity)
		return
	}
	defer resp.Body.Close()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

// POST /api/campaigns/{id}/ai-style/suggest - Sonnet reads the campaign setup
// (segment, brand, dealer, catalog) and proposes a recommended ai_style the user can
// review + apply. No body needed; the ai-agent fetches the campaign context itself.
func (s *server) handleSuggestAIStyle(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	s.postAIAgent(w, r, "/style/suggest", map[string]string{
		"org_id":      a.OrgID,
		"campaign_id": r.PathValue("id"),
	})
}

// POST /api/campaigns/{id}/ai-style/preview {style, message} - generate one sample
// nurture reply to `message` using the DRAFT style, so the user can tune before saving.
func (s *server) handlePreviewAIStyle(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var b struct {
		Style   json.RawMessage `json:"style"`
		Message string          `json:"message"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	s.postAIAgent(w, r, "/style/preview", map[string]any{
		"org_id":      a.OrgID,
		"campaign_id": r.PathValue("id"),
		"style":       b.Style,
		"message":     b.Message,
	})
}
