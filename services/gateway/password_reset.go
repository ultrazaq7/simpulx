package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/simpulx/v2/libs/go/config"
)

const resetTokenTTL = time.Hour

func hashResetToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// handleForgotPassword issues a single-use reset token and emails the link.
// Always returns 200 with a generic message so attackers can't enumerate which
// emails are registered.
func (s *server) handleForgotPassword(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Email) == "" {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	generic := map[string]any{"message": "If that email is registered, a reset link has been sent."}

	var userID, name string
	err := s.pool.QueryRow(r.Context(),
		`SELECT id, full_name FROM users WHERE lower(email)=lower($1) AND status='active'`,
		body.Email,
	).Scan(&userID, &name)
	if err != nil {
		writeJSON(w, generic) // unknown email -> say nothing
		return
	}

	// Random url-safe token; store only its hash.
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	token := base64.RawURLEncoding.EncodeToString(raw)

	if _, err := s.pool.Exec(r.Context(),
		`INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
		 VALUES ($1, $2, now() + $3::interval)`,
		userID, hashResetToken(token), resetTokenTTL.String(),
	); err != nil {
		s.log.Error("reset token insert failed", "err", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}

	base := strings.TrimRight(config.Get("APP_BASE_URL", "http://localhost:3000"), "/")
	link := base + "/reset-password?token=" + token

	sent, mailErr := s.sendMail(body.Email, "Reset your Simpulx password", resetEmailHTML(name, link))
	if mailErr != nil {
		s.log.Error("reset email send failed", "err", mailErr)
	}
	if !sent {
		// SMTP not configured (or failed): surface the link in logs so dev/admin
		// can still complete the flow. Never returned in the API response.
		s.log.Info("password reset link (email not sent)", "email", body.Email, "link", link)
	}
	writeJSON(w, generic)
}

// handleChangePassword lets a signed-in user change their own password by
// proving the current one (no email round-trip). POST /api/account/password.
func (s *server) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var body struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if len(body.NewPassword) < 8 {
		http.Error(w, "New password must be at least 8 characters", http.StatusBadRequest)
		return
	}

	var hash string
	if err := s.pool.QueryRow(r.Context(),
		`SELECT password_hash FROM users WHERE id=$1`, a.UserID).Scan(&hash); err != nil {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}
	if !verifyPassword(body.CurrentPassword, hash) {
		http.Error(w, "Current password is incorrect", http.StatusBadRequest)
		return
	}
	if verifyPassword(body.NewPassword, hash) {
		http.Error(w, "New password must be different from the current one", http.StatusBadRequest)
		return
	}

	newHash, err := hashPassword(body.NewPassword)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if _, err := s.pool.Exec(r.Context(),
		`UPDATE users SET password_hash=$1, updated_at=now() WHERE id=$2`, newHash, a.UserID); err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"message": "Password updated"})
}

// handleResetPassword consumes a valid token and sets the new password.
func (s *server) handleResetPassword(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Token       string `json:"token"`
		NewPassword string `json:"newPassword"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if len(body.NewPassword) < 8 {
		http.Error(w, "password must be at least 8 characters", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(body.Token) == "" {
		http.Error(w, "invalid or expired token", http.StatusBadRequest)
		return
	}

	var tokenID, userID string
	err := s.pool.QueryRow(r.Context(),
		`SELECT id, user_id FROM password_reset_tokens
		  WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now()`,
		hashResetToken(body.Token),
	).Scan(&tokenID, &userID)
	if err != nil {
		http.Error(w, "invalid or expired token", http.StatusBadRequest)
		return
	}

	hash, err := hashPassword(body.NewPassword)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}

	tx, err := s.pool.Begin(r.Context())
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	if _, err := tx.Exec(r.Context(),
		`UPDATE users SET password_hash=$1, updated_at=now() WHERE id=$2`, hash, userID); err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	// Mark this token used and invalidate any other outstanding tokens for the user.
	if _, err := tx.Exec(r.Context(),
		`UPDATE password_reset_tokens SET used_at=now()
		  WHERE user_id=$1 AND used_at IS NULL`, userID); err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"message": "Password reset successfully. You can now sign in."})
}
