package main

import (
	"encoding/json"
	"net/http"
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

// POST /api/channels — manual connect (real Meta OAuth is added later).
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

// POST /api/channels/{id}/test — verify the connection.
// In dev/mock mode this just marks the channel connected; with real
// credentials it would ping the provider (Meta Graph API) first.
func (s *server) handleTestChannel(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	tag, err := s.pool.Exec(r.Context(),
		`UPDATE channels SET status='connected', connected_at=now(), updated_at=now()
		  WHERE id=$1 AND organization_id=$2`, r.PathValue("id"), a.OrgID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	writeJSON(w, map[string]any{"status": "connected"})
}

// nullableJSON returns nil for an empty payload so COALESCE keeps the old value.
func nullableJSON(b []byte) any {
	if len(b) == 0 {
		return nil
	}
	return string(b)
}
