// Package gsheets is a tiny Google Sheets append-row client backed by a service
// account (GOOGLE_SA_KEY_B64). Shared by the gateway (form responses) and the
// messaging executor (automation "add row" node). No SDK dependency.
package gsheets

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
	"os"
	"regexp"
	"strings"
	"sync"
	"time"
)

type serviceAccount struct {
	ClientEmail string `json:"client_email"`
	PrivateKey  string `json:"private_key"`
	priv        *rsa.PrivateKey
}

var (
	saOnce sync.Once
	saVal  *serviceAccount
	saErr  error

	tokMu  sync.Mutex
	tok    string
	tokExp time.Time
)

func loadSA() (*serviceAccount, error) {
	saOnce.Do(func() {
		b64 := strings.TrimSpace(os.Getenv("GOOGLE_SA_KEY_B64"))
		if b64 == "" {
			saErr = fmt.Errorf("GOOGLE_SA_KEY_B64 not set")
			return
		}
		raw, err := base64.StdEncoding.DecodeString(b64)
		if err != nil {
			saErr = fmt.Errorf("decode GOOGLE_SA_KEY_B64: %w", err)
			return
		}
		var sa serviceAccount
		if err := json.Unmarshal(raw, &sa); err != nil {
			saErr = fmt.Errorf("parse service account json: %w", err)
			return
		}
		block, _ := pem.Decode([]byte(sa.PrivateKey))
		if block == nil {
			saErr = fmt.Errorf("service account private_key is not PEM")
			return
		}
		key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
		if err != nil {
			saErr = fmt.Errorf("parse private key: %w", err)
			return
		}
		rk, ok := key.(*rsa.PrivateKey)
		if !ok {
			saErr = fmt.Errorf("private key is not RSA")
			return
		}
		sa.priv = rk
		saVal = &sa
	})
	return saVal, saErr
}

// Email returns the service-account email (so callers can tell the user which
// account to share their sheet with). Empty if not configured.
func Email() string {
	sa, err := loadSA()
	if err != nil {
		return ""
	}
	return sa.ClientEmail
}

func b64url(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }

func accessToken(ctx context.Context, client *http.Client) (string, error) {
	tokMu.Lock()
	defer tokMu.Unlock()
	if tok != "" && time.Now().Before(tokExp.Add(-2*time.Minute)) {
		return tok, nil
	}
	sa, err := loadSA()
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
	sig, err := rsa.SignPKCS1v15(rand.Reader, sa.priv, crypto.SHA256, h[:])
	if err != nil {
		return "", err
	}
	jwt := signingInput + "." + b64url(sig)

	form := url.Values{}
	form.Set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer")
	form.Set("assertion", jwt)
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, "https://oauth2.googleapis.com/token", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := client.Do(req)
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
	tok = out.AccessToken
	tokExp = now.Add(time.Duration(out.ExpiresIn) * time.Second)
	return tok, nil
}

var sheetIDRe = regexp.MustCompile(`/spreadsheets/d/([a-zA-Z0-9_-]+)`)

// ParseSpreadsheetID accepts a full Sheets URL or a raw spreadsheet id.
func ParseSpreadsheetID(s string) string {
	s = strings.TrimSpace(s)
	if m := sheetIDRe.FindStringSubmatch(s); m != nil {
		return m[1]
	}
	return s
}

// AppendRow appends one row to the given spreadsheet tab (default Sheet1).
func AppendRow(ctx context.Context, client *http.Client, spreadsheetID, tab string, row []string) error {
	t, err := accessToken(ctx, client)
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
	req.Header.Set("Authorization", "Bearer "+t)
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		buf := make([]byte, 512)
		n, _ := resp.Body.Read(buf)
		return fmt.Errorf("sheets append %d: %s", resp.StatusCode, string(buf[:n]))
	}
	return nil
}
