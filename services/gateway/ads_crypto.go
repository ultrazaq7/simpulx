package main

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"strings"
)

// Ad-account OAuth tokens (Meta/TikTok access tokens, Google refresh tokens) are
// stored in ad_accounts.access_token. They used to be PLAINTEXT — anyone with DB
// read (or a copy of the nightly S3 dump) could take over a customer's ad
// account. These helpers wrap the token in AES-256-GCM at the DB boundary:
// encrypt just before write, decrypt just after read. Runtime use is unchanged.
//
// Format: "enc:v1:" + base64(nonce || ciphertext||tag). The version tag leaves
// room to rotate the scheme. A value WITHOUT the prefix is treated as legacy
// plaintext everywhere, so a pre-encryption row (or a mid-deploy write from an
// old binary) never breaks a sync.

const adsTokenPrefix = "enc:v1:"

// adsTokenKey is the 32-byte AES key, or nil when ADS_TOKEN_ENC_KEY is unset. A
// nil key means encryption is DISABLED (tokens stay plaintext) — the feature
// keeps working, but at-rest protection is off. initAdsTokenKey logs loudly so
// this is never a silent surprise in prod.
var adsTokenKey []byte

// initAdsTokenKey loads and validates the key once at startup. A missing key is
// a warning, not a fatal, so a first deploy (before the key is provisioned in
// .env) still boots and serves ads; a malformed key IS fatal because it means
// someone tried to configure it and got it wrong.
func initAdsTokenKey(log *slog.Logger) {
	raw := strings.TrimSpace(os.Getenv("ADS_TOKEN_ENC_KEY"))
	if raw == "" {
		log.Warn("ADS_TOKEN_ENC_KEY is not set — ad-account OAuth tokens will be stored PLAINTEXT. Set a base64-encoded 32-byte key to enable encryption at rest.")
		return
	}
	key, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		log.Error("ADS_TOKEN_ENC_KEY is not valid base64 — refusing to start", "err", err)
		os.Exit(1)
	}
	if len(key) != 32 {
		log.Error("ADS_TOKEN_ENC_KEY must decode to exactly 32 bytes (AES-256) — refusing to start", "bytes", len(key))
		os.Exit(1)
	}
	adsTokenKey = key
	log.Info("ad-account token encryption enabled (AES-256-GCM)")
}

// encryptAdToken wraps a plaintext token for storage. Empty stays empty (a NULL
// or '' token is legitimate and used by NULLIF(...) guards). When no key is
// configured, or the value is already encrypted, it is returned unchanged.
func encryptAdToken(plain string) (string, error) {
	if plain == "" || adsTokenKey == nil || strings.HasPrefix(plain, adsTokenPrefix) {
		return plain, nil
	}
	gcm, err := adsTokenGCM()
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	sealed := gcm.Seal(nonce, nonce, []byte(plain), nil)
	return adsTokenPrefix + base64.StdEncoding.EncodeToString(sealed), nil
}

// decryptAdToken reverses encryptAdToken. Values without the prefix are legacy
// plaintext and returned as-is. An encrypted value with no key available is an
// error (misconfiguration) rather than a silent empty token.
func decryptAdToken(stored string) (string, error) {
	if !strings.HasPrefix(stored, adsTokenPrefix) {
		return stored, nil // empty or legacy plaintext
	}
	if adsTokenKey == nil {
		return "", errors.New("ad token is encrypted but ADS_TOKEN_ENC_KEY is not set")
	}
	gcm, err := adsTokenGCM()
	if err != nil {
		return "", err
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(stored, adsTokenPrefix))
	if err != nil {
		return "", fmt.Errorf("ad token base64 decode: %w", err)
	}
	if len(raw) < gcm.NonceSize() {
		return "", errors.New("ad token ciphertext too short")
	}
	nonce, ct := raw[:gcm.NonceSize()], raw[gcm.NonceSize():]
	pt, err := gcm.Open(nil, nonce, ct, nil)
	if err != nil {
		return "", fmt.Errorf("ad token decrypt: %w", err)
	}
	return string(pt), nil
}

func adsTokenGCM() (cipher.AEAD, error) {
	block, err := aes.NewCipher(adsTokenKey)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

// backfillAdTokenEncryption encrypts any ad_accounts rows still holding a
// plaintext token. Idempotent (already-encrypted rows are skipped by the
// prefix check) and a no-op when no key is configured. Runs once at startup so
// existing connections get protected without a manual migration step.
func (s *server) backfillAdTokenEncryption(ctx context.Context) {
	if adsTokenKey == nil {
		return
	}
	rows, err := s.pool.Query(ctx,
		`SELECT id::text, access_token FROM ad_accounts
		  WHERE access_token IS NOT NULL AND access_token <> '' AND access_token NOT LIKE 'enc:v1:%'`)
	if err != nil {
		s.log.Warn("ad token backfill query failed", "err", err)
		return
	}
	type row struct{ id, token string }
	var pending []row
	for rows.Next() {
		var rrow row
		if err := rows.Scan(&rrow.id, &rrow.token); err == nil {
			pending = append(pending, rrow)
		}
	}
	rows.Close()

	migrated := 0
	for _, p := range pending {
		enc, err := encryptAdToken(p.token)
		if err != nil {
			s.log.Warn("ad token backfill encrypt failed", "id", p.id, "err", err)
			continue
		}
		if _, err := s.pool.Exec(ctx,
			`UPDATE ad_accounts SET access_token=$2 WHERE id=$1`, p.id, enc); err != nil {
			s.log.Warn("ad token backfill update failed", "id", p.id, "err", err)
			continue
		}
		migrated++
	}
	if migrated > 0 {
		s.log.Info("ad token backfill: encrypted plaintext tokens at rest", "count", migrated)
	}
}
