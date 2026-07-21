package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/argon2"
)

// ── Argon2id password hashing ───────────────────────────────

type argonParams struct {
	memory, iterations uint32
	parallelism        uint8
	saltLen, keyLen    uint32
}

var defaultArgon = argonParams{memory: 64 * 1024, iterations: 3, parallelism: 4, saltLen: 16, keyLen: 32}

func hashPassword(password string) (string, error) {
	salt := make([]byte, defaultArgon.saltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key := argon2.IDKey([]byte(password), salt, defaultArgon.iterations, defaultArgon.memory, defaultArgon.parallelism, defaultArgon.keyLen)
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, defaultArgon.memory, defaultArgon.iterations, defaultArgon.parallelism,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(key)), nil
}

func verifyPassword(password, encoded string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false
	}
	var mem, iter uint32
	var par uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &mem, &iter, &par); err != nil {
		return false
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return false
	}
	got := argon2.IDKey([]byte(password), salt, iter, mem, par, uint32(len(want)))
	return subtle.ConstantTimeCompare(got, want) == 1
}

// ── JWT ─────────────────────────────────────────────────────

type claims struct {
	OrgID string `json:"org"`
	Role  string `json:"role"`
	Name  string `json:"name"`
	// Impersonation (superadmin "act as"). ImpBy is the SUPERADMIN's own user id.
	// It is what the audit log must name: Subject is the borrowed account, so
	// without this every change support makes would be recorded as the customer's
	// own. Sessions are full-access on purpose -- support has to be able to finish
	// a setup, not just look at it -- which is exactly why attribution matters.
	ImpBy string `json:"imp_by,omitempty"`
	jwt.RegisteredClaims
}

func (s *server) issueToken(userID, orgID, role, name string) (string, error) {
	c := claims{
		OrgID: orgID, Role: role, Name: name,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(s.jwtTTL)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, c).SignedString([]byte(s.jwtSecret))
}

// issueImpersonationToken mints a SHORT-LIVED token for another org.
//
// Full access on purpose: support needs to finish a customer's setup, not just
// look at it. The safeguards are therefore attribution and time, not permission:
// every audited action names the superadmin (see audit), the token expires on its
// own so a forgotten tab stops working, and it is never refreshable -- no
// refresh_tokens row is written, so it cannot quietly become a permanent session.
func (s *server) issueImpersonationToken(superAdminID, targetUserID, orgID, role, name string, ttl time.Duration) (string, error) {
	c := claims{
		OrgID: orgID, Role: role, Name: name,
		ImpBy: superAdminID,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   targetUserID,
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(ttl)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, c).SignedString([]byte(s.jwtSecret))
}

func (s *server) parseToken(tokenStr string) (*claims, error) {
	c := &claims{}
	_, err := jwt.ParseWithClaims(tokenStr, c, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(s.jwtSecret), nil
	})
	if err != nil {
		return nil, err
	}
	return c, nil
}

// ── Auth context ────────────────────────────────────────────

type ctxKey string

const authCtxKey ctxKey = "auth"

type authInfo struct {
	UserID, OrgID, Role, Name string
	// ImpersonatedBy is empty for a normal session. When set, the caller is a
	// superadmin acting inside another tenant.
	ImpersonatedBy string
}

func authFrom(ctx context.Context) (authInfo, bool) {
	a, ok := ctx.Value(authCtxKey).(authInfo)
	return a, ok
}

// requireAuth adalah middleware yang memverifikasi Bearer JWT.
func (s *server) requireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		h := r.Header.Get("Authorization")
		if !strings.HasPrefix(h, "Bearer ") {
			// Check query parameter
			qToken := r.URL.Query().Get("token")
			if qToken != "" {
				h = "Bearer " + qToken
			} else {
				http.Error(w, "missing token", http.StatusUnauthorized)
				return
			}
		}
		c, err := s.parseToken(strings.TrimPrefix(h, "Bearer "))
		if err != nil {
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}
		ai := authInfo{UserID: c.Subject, OrgID: c.OrgID, Role: c.Role, Name: c.Name, ImpersonatedBy: c.ImpBy}
		next(w, r.WithContext(context.WithValue(r.Context(), authCtxKey, ai)))
	}
}

// ── Login ───────────────────────────────────────────────────

func (s *server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	var (
		id, orgID, role, name, hash string
		avatar                      *string
	)
	err := s.pool.QueryRow(r.Context(),
		`SELECT id, organization_id, role, full_name, password_hash, avatar_url
		   FROM users WHERE lower(email) = lower($1) AND status = 'active'`,
		body.Email,
	).Scan(&id, &orgID, &role, &name, &hash, &avatar)
	if err != nil || !verifyPassword(body.Password, hash) {
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}
	token, err := s.issueToken(id, orgID, role, name)
	if err != nil {
		http.Error(w, "token error", http.StatusInternalServerError)
		return
	}
	refresh, err := s.issueRefreshToken(r.Context(), id)
	if err != nil {
		http.Error(w, "token error", http.StatusInternalServerError)
		return
	}
	// Logging in marks the user online (presence), distinct from the account
	// lifecycle `status` (active/inactive) which gates login above. Capture the
	// prior presence so we log an online transition only on offline -> online.
	var wasOnline bool
	if qErr := s.pool.QueryRow(r.Context(),
		`WITH prev AS (SELECT is_online FROM users WHERE id = $1 FOR UPDATE)
		 UPDATE users u SET last_login_at = now(), is_online = true, last_seen_at = now()
		 FROM prev WHERE u.id = $1
		 RETURNING prev.is_online`, id).Scan(&wasOnline); qErr == nil && !wasOnline {
		s.logUserActivity(r.Context(), orgID, id, id, "presence", "online", map[string]any{"via": "login"})
	}
	writeJSON(w, map[string]any{
		"token":         token,
		"refresh_token": refresh,
		"user":          map[string]any{"id": id, "org_id": orgID, "role": role, "name": name, "email": body.Email, "is_online": true, "avatar": derefStr(avatar), "is_super_admin": s.superAdminByEmail(body.Email, role)},
	})
}

// ── Refresh tokens (opaque, DB-backed, rotating) ────────────
// The access JWT stays short-lived; the client silently exchanges this refresh
// token at /auth/refresh for a new access token, so a session never ends mid-use.
// Only the SHA-256 hash is stored (a DB leak can't replay it), and tokens are
// revocable — logout, rotation, or an inactive account all invalidate them.

func hashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

// issueRefreshToken mints a new opaque refresh token, persisting only its hash.
func (s *server) issueRefreshToken(ctx context.Context, userID string) (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	raw := base64.RawURLEncoding.EncodeToString(buf)
	if _, err := s.pool.Exec(ctx,
		`INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
		userID, hashToken(raw), time.Now().Add(s.refreshTTL)); err != nil {
		return "", err
	}
	return raw, nil
}

// handleRefresh exchanges a valid refresh token for a fresh access token and
// rotates the refresh token (the presented one is revoked, a new one issued).
// A revoked/expired/unknown token or an inactive account returns 401.
func (s *server) handleRefresh(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.RefreshToken == "" {
		http.Error(w, "refresh_token required", http.StatusBadRequest)
		return
	}
	var rtID, userID, orgID, role, name, status string
	err := s.pool.QueryRow(r.Context(),
		`SELECT rt.id, u.id, u.organization_id, u.role, u.full_name, u.status
		   FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
		  WHERE rt.token_hash = $1 AND rt.revoked_at IS NULL AND rt.expires_at > now()`,
		hashToken(body.RefreshToken),
	).Scan(&rtID, &userID, &orgID, &role, &name, &status)
	if err != nil || status != "active" {
		http.Error(w, "invalid refresh token", http.StatusUnauthorized)
		return
	}
	// Rotate: revoke the presented token, mint a fresh one.
	_, _ = s.pool.Exec(r.Context(),
		`UPDATE refresh_tokens SET revoked_at = now(), last_used_at = now() WHERE id = $1`, rtID)
	refresh, err := s.issueRefreshToken(r.Context(), userID)
	if err != nil {
		http.Error(w, "token error", http.StatusInternalServerError)
		return
	}
	token, err := s.issueToken(userID, orgID, role, name)
	if err != nil {
		http.Error(w, "token error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"token": token, "refresh_token": refresh})
}

// handleLogout revokes the presented refresh token (best effort); the short-lived
// access token is left to expire on its own.
func (s *server) handleLogout(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RefreshToken string `json:"refresh_token"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body.RefreshToken != "" {
		_, _ = s.pool.Exec(r.Context(),
			`UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`,
			hashToken(body.RefreshToken))
	}
	writeJSON(w, map[string]any{"status": "ok"})
}

// bootstrapDemoPassword (DEV) menetapkan password argon2id untuk user yang masih
// memakai hash placeholder, sehingga dashboard bisa login. Hanya jalan bila
// BOOTSTRAP_DEMO_PASSWORD diset.
func (s *server) bootstrapDemoPassword(ctx context.Context, password string) {
	if password == "" {
		return
	}
	hash, err := hashPassword(password)
	if err != nil {
		s.log.Error("bootstrap hash failed", "err", err)
		return
	}
	tag, err := s.pool.Exec(ctx,
		`UPDATE users SET password_hash = $1 WHERE password_hash LIKE '%placeholder%'`, hash)
	if err != nil {
		s.log.Error("bootstrap update failed", "err", err)
		return
	}
	if tag.RowsAffected() > 0 {
		s.log.Info("demo passwords bootstrapped", "users", tag.RowsAffected())
	}
}
