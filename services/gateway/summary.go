package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"time"
)

// ── POST /api/conversations/{id}/summary - stream an on-demand AI briefing (SSE) ──
// Proxies the ai-agent's SSE stream straight through to the inbox composer so it
// can render "AI Smart Summary" token-by-token. The ai-agent persists the final
// text to conversations.lead_summary.
func (s *server) handleSummaryStream(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	convID := r.PathValue("id")
	if !s.guardConversation(w, r, convID) {
		return // RBAC/IDOR guard already wrote the response (404)
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}

	lang := r.URL.Query().Get("lang") // app UI language; fallback when convo language is unclear
	if lang == "" {
		lang = "en"
	}
	reqBody, _ := json.Marshal(map[string]string{
		"conversation_id": convID,
		"org_id":          a.OrgID,
		"app_lang":        lang,
	})

	// The LLM stream can run for many seconds - don't use the short-lived shared
	// httpClient; bound it with our own context instead.
	ctx, cancel := context.WithTimeout(r.Context(), 120*time.Second)
	defer cancel()
	upReq, err := http.NewRequestWithContext(ctx, http.MethodPost,
		s.aiAgentURL+"/summary/stream", bytes.NewReader(reqBody))
	if err != nil {
		http.Error(w, "request build failed", http.StatusInternalServerError)
		return
	}
	upReq.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(upReq)
	if err != nil {
		http.Error(w, "ai-agent unreachable", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // disable proxy buffering (nginx)
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	// Pump upstream SSE to the client, flushing each chunk so tokens arrive live.
	buf := make([]byte, 4096)
	for {
		n, rerr := resp.Body.Read(buf)
		if n > 0 {
			if _, werr := w.Write(buf[:n]); werr != nil {
				return // client disconnected
			}
			flusher.Flush()
		}
		if rerr != nil {
			if rerr != io.EOF {
				s.log.Warn("summary stream upstream read", "err", rerr)
			}
			return
		}
	}
}
