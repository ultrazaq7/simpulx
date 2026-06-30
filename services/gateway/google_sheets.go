package main

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/simpulx/v2/libs/go/config"
)

// ============================================================
// Google Sheets connector — append rows via a service account.
// The service-account JSON is provided base64-encoded in GOOGLE_SA_KEY_B64
// (never committed; injected into the prod env). We mint a JWT, exchange it for
// an access token, and call the Sheets values.append REST API. No SDK deps.
// ============================================================

type googleSA struct {
	ClientEmail string `json:"client_email"`
	PrivateKey  string `json:"private_key"`
	privKey     *rsa.PrivateKey
}

var (
	gsaOnce  sync.Once
	gsaCreds *googleSA
	gsaErr   error

	gsTokMu  sync.Mutex
	gsToken  string
	gsTokExp time.Time
)

func loadGoogleSA() (*googleSA, error) {
	gsaOnce.Do(func() {
		b64 := config.Get("GOOGLE_SA_KEY_B64", "")
		if b64 == "" {
			gsaErr = fmt.Errorf("GOOGLE_SA_KEY_B64 not set")
			return
		}
		raw, err := base64.StdEncoding.DecodeString(strings.TrimSpace(b64))
		if err != nil {
			gsaErr = fmt.Errorf("decode GOOGLE_SA_KEY_B64: %w", err)
			return
		}
		var sa googleSA
		if err := json.Unmarshal(raw, &sa); err != nil {
			gsaErr = fmt.Errorf("parse service account json: %w", err)
			return
		}
		block, _ := pem.Decode([]byte(sa.PrivateKey))
		if block == nil {
			gsaErr = fmt.Errorf("service account private_key is not PEM")
			return
		}
		key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
		if err != nil {
			gsaErr = fmt.Errorf("parse private key: %w", err)
			return
		}
		rsaKey, ok := key.(*rsa.PrivateKey)
		if !ok {
			gsaErr = fmt.Errorf("private key is not RSA")
			return
		}
		sa.privKey = rsaKey
		gsaCreds = &sa
	})
	return gsaCreds, gsaErr
}

// googleSAEmail returns the service-account email so the UI can tell the user
// which account to share their sheet with. Empty if not configured.
func googleSAEmail() string {
	sa, err := loadGoogleSA()
	if err != nil {
		return ""
	}
	return sa.ClientEmail
}

func b64url(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }

func (s *server) googleAccessToken(ctx context.Context) (string, error) {
	gsTokMu.Lock()
	defer gsTokMu.Unlock()
	if gsToken != "" && time.Now().Before(gsTokExp.Add(-2*time.Minute)) {
		return gsToken, nil
	}
	sa, err := loadGoogleSA()
	if err != nil {
		return "", err
	}
	now := time.Now()
	header := b64url([]byte(`{"alg":"RS256","typ":"JWT"}`))
	claims, _ := json.Marshal(map[string]any{
		"iss":   sa.ClientEmail,
		"scope": "https://www.googleapis.com/auth/spreadsheets",
		"aud":   "https://oauth2.googleapis.com/token",
		"iat":   now.Unix(),
		"exp":   now.Add(time.Hour).Unix(),
	})
	signingInput := header + "." + b64url(claims)
	h := sha256.Sum256([]byte(signingInput))
	sig, err := rsa.SignPKCS1v15(rand.Reader, sa.privKey, crypto.SHA256, h[:])
	if err != nil {
		return "", err
	}
	jwt := signingInput + "." + b64url(sig)

	form := url.Values{}
	form.Set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer")
	form.Set("assertion", jwt)
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, "https://oauth2.googleapis.com/token", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var out struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
		Error       string `json:"error"`
		ErrorDesc   string `json:"error_description"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&out)
	if out.AccessToken == "" {
		return "", fmt.Errorf("google token error: %s %s", out.Error, out.ErrorDesc)
	}
	gsToken = out.AccessToken
	gsTokExp = now.Add(time.Duration(out.ExpiresIn) * time.Second)
	return gsToken, nil
}

var sheetIDRe = regexp.MustCompile(`/spreadsheets/d/([a-zA-Z0-9_-]+)`)

// parseSpreadsheetID accepts a full Sheets URL or a raw spreadsheet id.
func parseSpreadsheetID(s string) string {
	s = strings.TrimSpace(s)
	if m := sheetIDRe.FindStringSubmatch(s); m != nil {
		return m[1]
	}
	return s
}

// appendSheetRow appends one row to the given spreadsheet tab (default Sheet1).
func (s *server) appendSheetRow(ctx context.Context, spreadsheetID, tab string, row []string) error {
	token, err := s.googleAccessToken(ctx)
	if err != nil {
		return err
	}
	if tab == "" {
		tab = "Sheet1"
	}
	vals := make([]any, len(row))
	for i, v := range row {
		vals[i] = v
	}
	body, _ := json.Marshal(map[string]any{"values": [][]any{vals}})
	rng := url.PathEscape(tab + "!A1")
	u := fmt.Sprintf("https://sheets.googleapis.com/v4/spreadsheets/%s/values/%s:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS", spreadsheetID, rng)
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, u, strings.NewReader(string(body)))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		var sb strings.Builder
		_, _ = sb.WriteString(fmt.Sprintf("sheets append %d", resp.StatusCode))
		buf := make([]byte, 512)
		n, _ := resp.Body.Read(buf)
		if n > 0 {
			sb.WriteString(": ")
			sb.Write(buf[:n])
		}
		return fmt.Errorf("%s", sb.String())
	}
	return nil
}

// GET /api/integrations/google-sheets — connection status + the service-account
// email the user must share their sheet with.
func (s *server) handleGoogleSheetsInfo(w http.ResponseWriter, r *http.Request) {
	email := googleSAEmail()
	writeJSON(w, map[string]any{"connected": email != "", "client_email": email})
}
