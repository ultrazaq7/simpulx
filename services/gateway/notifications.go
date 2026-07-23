package main

import (
	"encoding/json"
	"io"
	"net/http"
)

// handleSnooze proxies a snooze to the conversation service (assigned agent or a
// manager may snooze a lead they can see). Injects the actor for the audit event.
func (s *server) handleSnooze(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	convID := r.PathValue("id")
	if !s.guardConversation(w, r, convID) {
		return
	}
	var body map[string]any
	bodyBytes, _ := io.ReadAll(r.Body)
	if len(bodyBytes) > 0 {
		_ = json.Unmarshal(bodyBytes, &body)
	}
	if body == nil {
		body = map[string]any{}
	}
	body["actor_id"] = a.UserID
	bodyBytes, _ = json.Marshal(body)
	s.proxyJSON(w, r.Context(), http.MethodPost, s.conversationURL+"/conversations/"+convID+"/snooze", bodyBytes)
}

// GET /api/notifications - the signed-in user's bell list + unread count.
func (s *server) handleListNotifications(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	rows, err := s.queryMaps(r.Context(),
		`SELECT id::text, type, title, body, conversation_id::text AS conversation_id, read_at, created_at
		   FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`, a.UserID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	var unread int64
	_ = s.pool.QueryRow(r.Context(),
		`SELECT count(*) FROM notifications WHERE user_id=$1 AND read_at IS NULL`, a.UserID).Scan(&unread)
	writeJSON(w, map[string]any{"notifications": rows, "unread": unread})
}

// POST /api/notifications/read {id?} - mark one (id) or all unread as read.
func (s *server) handleMarkNotificationsRead(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var b struct {
		ID string `json:"id"`
	}
	_ = json.NewDecoder(r.Body).Decode(&b)
	if b.ID != "" {
		_, _ = s.pool.Exec(r.Context(),
			`UPDATE notifications SET read_at=now() WHERE id=$1::uuid AND user_id=$2 AND read_at IS NULL`, b.ID, a.UserID)
	} else {
		_, _ = s.pool.Exec(r.Context(),
			`UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL`, a.UserID)
	}
	writeJSON(w, map[string]any{"status": "ok"})
}
