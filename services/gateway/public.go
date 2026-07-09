package main

import (
	"encoding/json"
	"net/http"
	"strings"
)

// POST /public/account-deletion — unauthenticated account/data-deletion request
// from the public /delete-account page (Google Play requirement). Records the
// request so the team can process it within the stated window. No auth: a
// signed-out (or already-locked-out) user must still be able to submit.
func (s *server) handleAccountDeletionRequest(w http.ResponseWriter, r *http.Request) {
	var b struct {
		Email  string `json:"email"`
		Reason string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	email := strings.TrimSpace(strings.ToLower(b.Email))
	if email == "" || !strings.Contains(email, "@") || len(email) > 320 {
		http.Error(w, "a valid email is required", http.StatusBadRequest)
		return
	}
	reason := strings.TrimSpace(b.Reason)
	if len(reason) > 2000 {
		reason = reason[:2000]
	}
	if _, err := s.pool.Exec(r.Context(),
		`INSERT INTO account_deletion_requests (email, reason) VALUES ($1, NULLIF($2,''))`,
		email, reason); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.log.Info("account deletion requested", "email", email)
	writeJSON(w, map[string]any{"status": "received"})
}
