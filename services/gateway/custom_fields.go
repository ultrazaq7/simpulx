package main

import (
	"encoding/json"
	"net/http"
	"strings"
)

// Org-defined typed custom fields for contacts. The values live in
// contacts.attributes (keyed by `key`); this endpoint manages the schema/labels
// so the contact form can render typed inputs and attribution stays consistent.

// GET /api/custom-fields — list (readable by anyone who can add/edit contacts).
func (s *server) handleListCustomFields(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	rows, err := s.queryMaps(r.Context(),
		`SELECT id::text AS id, key, label, type, options, sort_order, created_at
		   FROM custom_fields WHERE organization_id=$1 ORDER BY sort_order, label`, a.OrgID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

// POST /api/custom-fields {key,label,type,options,sort_order}
func (s *server) handleCreateCustomField(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var b struct {
		Key       string   `json:"key"`
		Label     string   `json:"label"`
		Type      string   `json:"type"`
		Options   []string `json:"options"`
		SortOrder int      `json:"sort_order"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	b.Key = slugifyFieldKey(b.Key)
	if b.Key == "" {
		b.Key = slugifyFieldKey(b.Label)
	}
	if b.Key == "" || strings.TrimSpace(b.Label) == "" {
		http.Error(w, "key & label required", http.StatusBadRequest)
		return
	}
	if !validFieldType(b.Type) {
		b.Type = "text"
	}
	opts, _ := json.Marshal(b.Options)
	var id string
	err := s.pool.QueryRow(r.Context(),
		`INSERT INTO custom_fields (organization_id, key, label, type, options, sort_order)
		 VALUES ($1,$2,$3,$4,$5::jsonb,$6)
		 ON CONFLICT (organization_id, key) DO UPDATE
		    SET label=EXCLUDED.label, type=EXCLUDED.type, options=EXCLUDED.options,
		        sort_order=EXCLUDED.sort_order, updated_at=now()
		 RETURNING id::text`,
		a.OrgID, b.Key, strings.TrimSpace(b.Label), b.Type, string(opts), b.SortOrder).Scan(&id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"id": id, "key": b.Key})
}

// PATCH /api/custom-fields/{id} — label/type/options/order (key is immutable so
// existing stored attribute values stay linked).
func (s *server) handleUpdateCustomField(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var b struct {
		Label     *string   `json:"label"`
		Type      *string   `json:"type"`
		Options   *[]string `json:"options"`
		SortOrder *int      `json:"sort_order"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	var optsJSON any
	if b.Options != nil {
		x, _ := json.Marshal(*b.Options)
		optsJSON = string(x)
	}
	typ := ""
	if b.Type != nil && validFieldType(*b.Type) {
		typ = *b.Type
	}
	_, err := s.pool.Exec(r.Context(),
		`UPDATE custom_fields SET
		   label = COALESCE($3, label),
		   type = COALESCE(NULLIF($4,''), type),
		   options = COALESCE($5::jsonb, options),
		   sort_order = COALESCE($6, sort_order),
		   updated_at = now()
		 WHERE id=$1 AND organization_id=$2`,
		r.PathValue("id"), a.OrgID, b.Label, typ, optsJSON, b.SortOrder)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"status": "updated"})
}

// DELETE /api/custom-fields/{id} — removes the field definition (stored values
// in contacts.attributes are left untouched but no longer surfaced).
func (s *server) handleDeleteCustomField(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	_, err := s.pool.Exec(r.Context(),
		`DELETE FROM custom_fields WHERE id=$1 AND organization_id=$2`, r.PathValue("id"), a.OrgID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"status": "deleted"})
}

func validFieldType(t string) bool {
	switch t {
	case "text", "number", "date", "select":
		return true
	}
	return false
}

// slugifyFieldKey normalizes a custom-field key to a safe attribute slug:
// lowercase a-z0-9, spaces/dashes -> underscore.
func slugifyFieldKey(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	var b strings.Builder
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == ' ' || r == '-' || r == '_':
			b.WriteByte('_')
		}
	}
	return strings.Trim(b.String(), "_")
}
