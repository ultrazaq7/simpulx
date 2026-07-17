package main

import (
	"context"
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

// appBaseURL returns the public web base URL (no trailing slash) used to build
// links in outbound emails.
func appBaseURL() string {
	return strings.TrimRight(config.Get("APP_BASE_URL", "http://localhost:3000"), "/")
}

// randomPassword returns a high-entropy url-safe string, used as the throwaway
// initial password for admin-created users who will set their own via the
// welcome link. Avoids shipping a known shared default like "changeme123".
func randomPassword() string {
	raw := make([]byte, 24)
	if _, err := rand.Read(raw); err != nil {
		// crypto/rand failure is effectively impossible; fall back to a value
		// that is still unique per call so no two accounts share a password.
		return base64.RawURLEncoding.EncodeToString([]byte(time.Now().Format(time.RFC3339Nano)))
	}
	return base64.RawURLEncoding.EncodeToString(raw)
}

// issueSetupLink mints a single-use password_reset token for a user and returns
// the full /reset-password URL. Shared by the forgot-password flow (1h TTL) and
// the new-user welcome flow (longer TTL, since a fresh user may not open the
// email immediately). Only the token hash is stored; the raw token lives only in
// the returned link.
func (s *server) issueSetupLink(ctx context.Context, userID string, ttl time.Duration) (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	if _, err := s.pool.Exec(ctx,
		`INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
		 VALUES ($1, $2, now() + $3::interval)`,
		userID, hashResetToken(token), ttl.String(),
	); err != nil {
		return "", err
	}
	return appBaseURL() + "/reset-password?token=" + token, nil
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

	link, err := s.issueSetupLink(r.Context(), userID, resetTokenTTL)
	if err != nil {
		s.log.Error("reset token insert failed", "err", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}

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

// ── Verified email change ────────────────────────────────────────────────────

func validEmail(e string) bool {
	at := strings.IndexByte(e, '@')
	if at <= 0 || at == len(e)-1 {
		return false
	}
	dot := strings.LastIndexByte(e, '.')
	return dot > at+1 && dot < len(e)-1 && !strings.ContainsAny(e, " \t\r\n")
}

// handleRequestEmailChange (auth) emails a single-use confirmation link to the
// NEW address. The account email is not touched until that link is used.
// POST /api/account/email {new_email}
func (s *server) handleRequestEmailChange(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var body struct {
		NewEmail string `json:"new_email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	newEmail := strings.ToLower(strings.TrimSpace(body.NewEmail))
	if !validEmail(newEmail) {
		http.Error(w, "Enter a valid email address", http.StatusBadRequest)
		return
	}

	var name, curEmail string
	if err := s.pool.QueryRow(r.Context(),
		`SELECT full_name, email FROM users WHERE id=$1`, a.UserID).Scan(&name, &curEmail); err != nil {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}
	if strings.EqualFold(newEmail, curEmail) {
		http.Error(w, "That is already your email address", http.StatusBadRequest)
		return
	}
	var taken bool
	_ = s.pool.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM users WHERE lower(email)=$1 AND id<>$2)`, newEmail, a.UserID).Scan(&taken)
	if taken {
		http.Error(w, "That email is already in use", http.StatusConflict)
		return
	}

	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	token := base64.RawURLEncoding.EncodeToString(raw)

	// Supersede any earlier pending requests, then store the new one.
	_, _ = s.pool.Exec(r.Context(),
		`UPDATE email_change_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL`, a.UserID)
	if _, err := s.pool.Exec(r.Context(),
		`INSERT INTO email_change_tokens (user_id, new_email, token_hash, expires_at)
		 VALUES ($1, $2, $3, now() + $4::interval)`,
		a.UserID, newEmail, hashResetToken(token), resetTokenTTL.String()); err != nil {
		s.log.Error("email change token insert failed", "err", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}

	base := strings.TrimRight(config.Get("APP_BASE_URL", "http://localhost:3000"), "/")
	link := base + "/verify-email?token=" + token
	sent, mailErr := s.sendMail(newEmail, "Confirm your new Simpulx email", emailChangeHTML(name, link, newEmail))
	if mailErr != nil {
		s.log.Error("email change send failed", "err", mailErr)
	}
	if !sent {
		s.log.Info("email change link (email not sent)", "email", newEmail, "link", link)
	}
	writeJSON(w, map[string]any{"message": "Verification link sent to " + newEmail})
}

// handleVerifyEmailChange consumes a valid token and swaps the account email.
// POST /auth/verify-email {token}
func (s *server) handleVerifyEmailChange(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Token) == "" {
		http.Error(w, "invalid or expired link", http.StatusBadRequest)
		return
	}

	var tokenID, userID, newEmail string
	err := s.pool.QueryRow(r.Context(),
		`SELECT id, user_id, new_email FROM email_change_tokens
		  WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now()`,
		hashResetToken(body.Token),
	).Scan(&tokenID, &userID, &newEmail)
	if err != nil {
		http.Error(w, "This link is invalid or has expired", http.StatusBadRequest)
		return
	}

	var taken bool
	_ = s.pool.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM users WHERE lower(email)=$1 AND id<>$2)`, newEmail, userID).Scan(&taken)
	if taken {
		http.Error(w, "That email is now in use by another account", http.StatusConflict)
		return
	}

	tx, err := s.pool.Begin(r.Context())
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	if _, err := tx.Exec(r.Context(),
		`UPDATE users SET email=$1, updated_at=now() WHERE id=$2`, newEmail, userID); err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if _, err := tx.Exec(r.Context(),
		`UPDATE email_change_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL`, userID); err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"message": "Email updated", "email": newEmail})
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
