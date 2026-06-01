package main

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
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
		ai := authInfo{UserID: c.Subject, OrgID: c.OrgID, Role: c.Role, Name: c.Name}
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
	)
	err := s.pool.QueryRow(r.Context(),
		`SELECT id, organization_id, role, full_name, password_hash
		   FROM users WHERE lower(email) = lower($1) AND status = 'active'`,
		body.Email,
	).Scan(&id, &orgID, &role, &name, &hash)
	if err != nil || !verifyPassword(body.Password, hash) {
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}
	token, err := s.issueToken(id, orgID, role, name)
	if err != nil {
		http.Error(w, "token error", http.StatusInternalServerError)
		return
	}
	_, _ = s.pool.Exec(r.Context(), `UPDATE users SET last_login_at = now() WHERE id = $1`, id)
	writeJSON(w, map[string]any{
		"token": token,
		"user":  map[string]any{"id": id, "org_id": orgID, "role": role, "name": name, "email": body.Email},
	})
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
