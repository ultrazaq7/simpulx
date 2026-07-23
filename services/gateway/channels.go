package main

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"net/url"
	"strings"

	"github.com/simpulx/v2/libs/go/config"
)

// ── Channels (omnichannel connections per org) ──────────────
// Backs the dashboard Channels page. Each row is one connected
// account (a WhatsApp number, an IG/Messenger page, ...). The
// `type` column groups them under a platform in the UI.

// GET /api/channels
func (s *server) handleListChannels(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	rows, err := s.queryMaps(r.Context(),
		`SELECT id::text AS id, type, name, status, is_active,
		        phone_number_id, waba_id, display_id, config,
		        (access_token IS NOT NULL AND access_token <> '') AS has_token,
		        calling_enabled,
		        connected_at, created_at
		   FROM channels
		  WHERE organization_id = $1
		  ORDER BY created_at`,
		a.OrgID,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

type channelInput struct {
	Type          string         `json:"type"`
	Name          string         `json:"name"`
	PhoneNumberID string         `json:"phone_number_id"`
	WabaID        string         `json:"waba_id"`
	AccessToken   string         `json:"access_token"`
	DisplayID     string         `json:"display_id"`
	Config        map[string]any `json:"config"`
}

// POST /api/channels - manual connect (real Meta OAuth is added later).
func (s *server) handleCreateChannel(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var b channelInput
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil || b.Name == "" {
		http.Error(w, "name required", http.StatusBadRequest)
		return
	}
	if b.Type == "" {
		b.Type = "whatsapp"
	}
	if b.Config == nil {
		b.Config = map[string]any{}
	}
	cfg, _ := json.Marshal(b.Config)

	// A freshly added channel is "pending" until the agent runs Test.
	var id string
	err := s.pool.QueryRow(r.Context(),
		`INSERT INTO channels (organization_id, type, name, phone_number_id, waba_id,
		                       access_token, display_id, config, status)
		 VALUES ($1,$2,$3,NULLIF($4,''),NULLIF($5,''),NULLIF($6,''),NULLIF($7,''),$8,'pending')
		 RETURNING id::text`,
		a.OrgID, b.Type, b.Name, b.PhoneNumberID, b.WabaID, b.AccessToken, b.DisplayID, cfg,
	).Scan(&id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.audit(r.Context(), a, "created", "channel", id, map[string]any{"name": b.Name, "type": b.Type})
	writeJSON(w, map[string]any{"id": id, "status": "pending"})
}

// PATCH /api/channels/{id}
func (s *server) handlePatchChannel(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	id := r.PathValue("id")
	var b struct {
		Name           *string        `json:"name"`
		IsActive       *bool          `json:"is_active"`
		AccessToken    *string        `json:"access_token"`
		DisplayID      *string        `json:"display_id"`
		Config         map[string]any `json:"config"`
		CallingEnabled *bool          `json:"calling_enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	var cfg []byte
	if b.Config != nil {
		cfg, _ = json.Marshal(b.Config)
	}
	tag, err := s.pool.Exec(r.Context(),
		`UPDATE channels SET
		   name = COALESCE($3, name),
		   is_active = COALESCE($4, is_active),
		   access_token = COALESCE(NULLIF($5,''), access_token),
		   display_id = COALESCE($6, display_id),
		   config = COALESCE($7::jsonb, config),
		   calling_enabled = COALESCE($8, calling_enabled),
		   updated_at = now()
		 WHERE id = $1 AND organization_id = $2`,
		id, a.OrgID, b.Name, b.IsActive, derefStr(b.AccessToken), b.DisplayID, nullableJSON(cfg), b.CallingEnabled)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	writeJSON(w, map[string]any{"status": "updated"})
}

// DELETE /api/channels/{id}
func (s *server) handleDeleteChannel(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	tag, err := s.pool.Exec(r.Context(),
		`DELETE FROM channels WHERE id = $1 AND organization_id = $2`, r.PathValue("id"), a.OrgID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	s.audit(r.Context(), a, "deleted", "channel", r.PathValue("id"), nil)
	writeJSON(w, map[string]any{"status": "deleted"})
}

// POST /api/channels/{id}/test - verify the connection.
//
// For a WhatsApp channel with real credentials this is also the step that makes
// the MANUAL path actually receive messages: it subscribes our app to the WABA
// (`subscribed_apps`). Embedded signup does that during provisioning, but a
// manually entered channel had no step that did - so it could sit "connected"
// while inbound webhooks never arrived. Best-effort: a failure surfaces as a
// warning, it does not block marking the channel connected (dev/mock has no
// credentials at all).
func (s *server) handleTestChannel(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var typ, wabaID, token string
	if err := s.pool.QueryRow(r.Context(),
		`SELECT type, COALESCE(waba_id,''), COALESCE(access_token,'')
		   FROM channels WHERE id=$1 AND organization_id=$2`,
		r.PathValue("id"), a.OrgID).Scan(&typ, &wabaID, &token); err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	warning := ""
	if typ == "whatsapp" && wabaID != "" && token != "" {
		if _, err := s.metaPost(r.Context(), fmt.Sprintf("%s/%s/subscribed_apps", graphBase, wabaID), token, map[string]any{}); err != nil {
			warning = "subscribed_apps: " + err.Error()
		}
	}

	if _, err := s.pool.Exec(r.Context(),
		`UPDATE channels SET status='connected', connected_at=now(), updated_at=now()
		  WHERE id=$1 AND organization_id=$2`, r.PathValue("id"), a.OrgID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"status": "connected", "warning": warning})
}

// nullableJSON returns nil for an empty payload so COALESCE keeps the old value.
func nullableJSON(b []byte) any {
	if len(b) == 0 {
		return nil
	}
	return string(b)
}

// ── WhatsApp Embedded Signup (real Meta provisioning) ──────────────────────
// POST /api/channels/embedded-signup
//
// The frontend runs Meta's Embedded Signup popup (Facebook JS SDK) which returns
// a short-lived OAuth `code` plus the selected `waba_id` / `phone_number_id`. We
// finish provisioning server-side: exchange the code for a business token,
// subscribe our app to the WABA so webhooks flow, and register the phone number.
// The result is a fully connected WhatsApp channel with no manual steps.
//
// Dev-safe: when META_APP_ID / META_APP_SECRET are unset we skip the live Graph
// calls and store the channel as `pending` (so the Test button can finish it),
// returning a warning instead of a 500.
func (s *server) handleEmbeddedSignup(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var b struct {
		Code          string `json:"code"`
		WabaID        string `json:"waba_id"`
		PhoneNumberID string `json:"phone_number_id"`
		Name          string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil || b.Code == "" || b.WabaID == "" || b.PhoneNumberID == "" {
		http.Error(w, "code, waba_id and phone_number_id are required", http.StatusBadRequest)
		return
	}

	appID := config.Get("META_APP_ID", "")
	appSecret := config.Get("META_APP_SECRET", "")
	name := strings.TrimSpace(b.Name)
	if name == "" {
		name = "WhatsApp Business"
	}

	status := "connected"
	warning := ""
	token := ""

	if appID == "" || appSecret == "" {
		// No credentials on the server - store what the popup gave us and let the
		// agent finish via Test once env is configured.
		status = "pending"
		warning = "META_APP_ID / META_APP_SECRET not configured on the server; channel saved as pending."
	} else {
		// 1) Exchange the code for a business integration system-user token.
		tok, err := s.metaExchangeCode(r.Context(), appID, appSecret, b.Code)
		if err != nil {
			http.Error(w, "code exchange failed: "+err.Error(), http.StatusUnprocessableEntity)
			return
		}
		token = tok
		// 2) Subscribe our app to the WABA so inbound webhooks are delivered.
		if _, err := s.metaPost(r.Context(), fmt.Sprintf("%s/%s/subscribed_apps", graphBase, b.WabaID), token, map[string]any{}); err != nil {
			warning = "subscribed_apps: " + err.Error()
		}
		// 3) Register the phone number (best-effort - may already be registered).
		pin := randomPIN()
		if _, err := s.metaPost(r.Context(), fmt.Sprintf("%s/%s/register", graphBase, b.PhoneNumberID), token,
			map[string]any{"messaging_product": "whatsapp", "pin": pin}); err != nil {
			if warning != "" {
				warning += "; "
			}
			warning += "register: " + err.Error()
		}
	}

	cfg, _ := json.Marshal(map[string]any{"provisioned_via": "embedded_signup"})
	var id string
	err := s.pool.QueryRow(r.Context(),
		`INSERT INTO channels (organization_id, type, name, phone_number_id, waba_id,
		                       access_token, config, status, connected_at)
		 VALUES ($1,'whatsapp',$2,NULLIF($3,''),NULLIF($4,''),NULLIF($5,''),$6,$7,
		         CASE WHEN $7='connected' THEN now() ELSE NULL END)
		 RETURNING id::text`,
		a.OrgID, name, b.PhoneNumberID, b.WabaID, token, cfg, status,
	).Scan(&id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.audit(r.Context(), a, "created", "channel", id, map[string]any{"name": name, "type": "whatsapp", "via": "embedded_signup"})
	writeJSON(w, map[string]any{"id": id, "status": status, "warning": warning})
}

// metaExchangeCode swaps the Embedded Signup OAuth code for an access token.
func (s *server) metaExchangeCode(ctx context.Context, appID, appSecret, code string) (string, error) {
	q := url.Values{}
	q.Set("client_id", appID)
	q.Set("client_secret", appSecret)
	q.Set("code", code)
	var out struct {
		AccessToken string `json:"access_token"`
		Error       *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := metaGet(ctx, fmt.Sprintf("%s/oauth/access_token?%s", graphBase, q.Encode()), &out); err != nil {
		return "", err
	}
	if out.Error != nil {
		return "", fmt.Errorf("meta: %s", out.Error.Message)
	}
	if out.AccessToken == "" {
		return "", fmt.Errorf("no access_token in response")
	}
	return out.AccessToken, nil
}

// randomPIN returns a 6-digit two-step verification PIN for number registration.
func randomPIN() string {
	n, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return "000000"
	}
	return fmt.Sprintf("%06d", n.Int64())
}

// ── Viber (real connect) ───────────────────────────────────────────────────
// POST /api/channels/viber/connect   Body: { auth_token, name }
//
// Verifies the Public Account auth token against Viber's REST API, registers our
// inbound webhook, then stores the channel. Inbound messages arrive at
// /webhook/viber and open conversations like Messenger / Instagram.
func (s *server) handleConnectViber(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var b struct {
		AuthToken string `json:"auth_token"`
		Name      string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil || strings.TrimSpace(b.AuthToken) == "" {
		http.Error(w, "auth_token is required", http.StatusBadRequest)
		return
	}
	token := strings.TrimSpace(b.AuthToken)

	// 1) Verify the token + read the account identity (real Viber call).
	info, err := viberGetAccountInfo(r.Context(), token)
	if err != nil {
		http.Error(w, "Viber rejected the token: "+err.Error(), http.StatusUnprocessableEntity)
		return
	}
	name := strings.TrimSpace(b.Name)
	if name == "" {
		name = info.Name
	}
	if name == "" {
		name = "Viber"
	}

	// 2) Store the channel first so we can register a per-channel webhook URL. A
	// Viber message payload doesn't carry the Public Account id, so we route by
	// the channel id embedded in the callback path (/webhook/viber/{id}).
	cfg, _ := json.Marshal(map[string]any{"viber_sender": info.ID, "viber_uri": info.URI})
	var id string
	err = s.pool.QueryRow(r.Context(),
		`INSERT INTO channels (organization_id, type, name, access_token, display_id, config, status, connected_at)
		 VALUES ($1,'viber',$2,$3,NULLIF($4,''),$5,'connected',now())
		 RETURNING id::text`,
		a.OrgID, name, token, info.ID, cfg,
	).Scan(&id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// 3) Register the inbound webhook (best-effort - localhost won't be reachable in dev).
	warning := ""
	hook := strings.TrimRight(config.Get("PUBLIC_API_URL", "http://localhost:8080"), "/") + "/webhook/viber/" + id
	if err := viberSetWebhook(r.Context(), token, hook); err != nil {
		warning = "webhook registration failed (set PUBLIC_API_URL to a public https URL): " + err.Error()
	}

	s.audit(r.Context(), a, "created", "channel", id, map[string]any{"name": name, "type": "viber"})
	writeJSON(w, map[string]any{"id": id, "status": "connected", "warning": warning})
}

type viberAccount struct {
	ID   string
	Name string
	URI  string
}

// viberGetAccountInfo calls Viber's get_account_info to validate the token.
func viberGetAccountInfo(ctx context.Context, token string) (viberAccount, error) {
	var out struct {
		Status        int    `json:"status"`
		StatusMessage string `json:"status_message"`
		ID            string `json:"id"`
		Name          string `json:"name"`
		URI           string `json:"uri"`
	}
	if err := viberPost(ctx, token, "https://chatapi.viber.com/pa/get_account_info", map[string]any{}, &out); err != nil {
		return viberAccount{}, err
	}
	if out.Status != 0 {
		return viberAccount{}, fmt.Errorf("%s", out.StatusMessage)
	}
	return viberAccount{ID: out.ID, Name: out.Name, URI: out.URI}, nil
}

// viberSetWebhook registers our inbound endpoint with Viber.
func viberSetWebhook(ctx context.Context, token, callbackURL string) error {
	var out struct {
		Status        int    `json:"status"`
		StatusMessage string `json:"status_message"`
	}
	body := map[string]any{
		"url":         callbackURL,
		"event_types": []string{"message", "subscribed", "conversation_started"},
		"send_name":   true,
		"send_photo":  false,
	}
	if err := viberPost(ctx, token, "https://chatapi.viber.com/pa/set_webhook", body, &out); err != nil {
		return err
	}
	if out.Status != 0 {
		return fmt.Errorf("%s", out.StatusMessage)
	}
	return nil
}

// viberPost performs an authenticated Viber REST call and decodes the response.
func viberPost(ctx context.Context, token, endpoint string, payload, out any) error {
	buf, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(string(buf)))
	if err != nil {
		return err
	}
	req.Header.Set("X-Viber-Auth-Token", token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := adHTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("viber http %d", resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}
