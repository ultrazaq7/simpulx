package main

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"io"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/simpulx/v2/libs/go/config"
)

// APNs VoIP push (PushKit) — the ONLY way to wake a killed iOS app and present a
// full-screen CallKit call. Firebase/FCM can't send VoIP pushes, so incoming
// WhatsApp calls reach iOS through this direct APNs channel instead. Android
// keeps its FCM + fullScreenIntent path; web is unaffected.
//
// Token-based auth (.p8): one auth key signs a short-lived ES256 JWT, reused for
// ~1h. No per-app certificate, no yearly expiry.

const (
	apnsProdHost    = "https://api.push.apple.com"
	apnsSandboxHost = "https://api.sandbox.push.apple.com"
)

type apnsLogger interface {
	Info(string, ...any)
	Warn(string, ...any)
	Error(string, ...any)
}

type apnsVoIP struct {
	key    *ecdsa.PrivateKey
	keyID  string
	teamID string
	topic  string // "<bundle>.voip"
	host   string
	client *http.Client

	mu    sync.Mutex
	tok   string
	tokAt time.Time
}

// newAPNSVoIP builds the sender from env, or returns nil when not configured (the
// feature simply stays off — iOS calls fall back to whatever the client can do).
//
//	APNS_AUTH_KEY_P8   PEM contents of the .p8   (preferred for a .env deploy)
//	APNS_AUTH_KEY_B64  base64 of the .p8         (alt)
//	APNS_AUTH_KEY_PATH path to the .p8 file      (alt)
//	APNS_KEY_ID        10-char key id            (required)
//	APNS_TEAM_ID       10-char team id           (required)
//	APNS_BUNDLE_ID     e.g. com.simpulx.app      (required; topic becomes <bundle>.voip)
//	APNS_PRODUCTION    "true" (default) -> api.push.apple.com, else sandbox
func newAPNSVoIP(log apnsLogger) *apnsVoIP {
	keyID := config.Get("APNS_KEY_ID", "")
	teamID := config.Get("APNS_TEAM_ID", "")
	bundle := config.Get("APNS_BUNDLE_ID", "")

	pemStr := config.Get("APNS_AUTH_KEY_P8", "")
	if pemStr == "" {
		if b64 := config.Get("APNS_AUTH_KEY_B64", ""); b64 != "" {
			if dec, err := base64.StdEncoding.DecodeString(b64); err == nil {
				pemStr = string(dec)
			}
		}
	}
	if pemStr == "" {
		if path := config.Get("APNS_AUTH_KEY_PATH", ""); path != "" {
			if b, err := os.ReadFile(path); err == nil {
				pemStr = string(b)
			}
		}
	}

	if keyID == "" || teamID == "" || bundle == "" || pemStr == "" {
		if log != nil {
			log.Info("APNs VoIP push disabled (set APNS_KEY_ID/TEAM_ID/BUNDLE_ID + APNS_AUTH_KEY_* to enable)")
		}
		return nil
	}

	key, err := parseAPNSKey(pemStr)
	if err != nil {
		if log != nil {
			log.Warn("APNs VoIP disabled: could not parse .p8", "err", err)
		}
		return nil
	}

	host := apnsProdHost
	if config.Get("APNS_PRODUCTION", "true") != "true" {
		host = apnsSandboxHost
	}
	if log != nil {
		log.Info("APNs VoIP push enabled", "topic", bundle+".voip", "production", host == apnsProdHost)
	}
	return &apnsVoIP{
		key:    key,
		keyID:  keyID,
		teamID: teamID,
		topic:  bundle + ".voip",
		host:   host,
		// Standard client negotiates HTTP/2 via ALPN over TLS, which APNs requires.
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

func parseAPNSKey(pemStr string) (*ecdsa.PrivateKey, error) {
	block, _ := pem.Decode([]byte(pemStr))
	if block == nil {
		return nil, errors.New("no PEM block found in APNs auth key")
	}
	k, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, err
	}
	ec, ok := k.(*ecdsa.PrivateKey)
	if !ok {
		return nil, errors.New("APNs auth key is not an ECDSA key")
	}
	return ec, nil
}

// providerToken returns a cached ES256 JWT, rotated at 50 min (APNs accepts a
// token for up to 60 min and rejects tokens minted more than once per ~20 min if
// churned, so caching is required, not just an optimization).
func (a *apnsVoIP) providerToken() (string, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.tok != "" && time.Since(a.tokAt) < 50*time.Minute {
		return a.tok, nil
	}
	t := jwt.NewWithClaims(jwt.SigningMethodES256, jwt.MapClaims{
		"iss": a.teamID,
		"iat": time.Now().Unix(),
	})
	t.Header["kid"] = a.keyID
	signed, err := t.SignedString(a.key)
	if err != nil {
		return "", err
	}
	a.tok, a.tokAt = signed, time.Now()
	return signed, nil
}

// push delivers one VoIP payload to a device token. Returns the HTTP status and
// APNs `reason` (e.g. "BadDeviceToken", "Unregistered") so the caller can prune
// dead tokens. A transport error returns err with status 0.
func (a *apnsVoIP) push(ctx context.Context, deviceToken string, payload []byte) (int, string, error) {
	tok, err := a.providerToken()
	if err != nil {
		return 0, "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, a.host+"/3/device/"+deviceToken, bytes.NewReader(payload))
	if err != nil {
		return 0, "", err
	}
	req.Header.Set("authorization", "bearer "+tok)
	req.Header.Set("apns-topic", a.topic)
	req.Header.Set("apns-push-type", "voip")
	req.Header.Set("apns-priority", "10")
	req.Header.Set("apns-expiration", "0") // deliver now or discard (a call is only useful live)

	resp, err := a.client.Do(req)
	if err != nil {
		return 0, "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusOK {
		return http.StatusOK, "", nil
	}
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	var e struct {
		Reason string `json:"reason"`
	}
	_ = json.Unmarshal(body, &e)
	return resp.StatusCode, e.Reason, nil
}
