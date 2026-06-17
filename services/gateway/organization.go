package main

import (
	"encoding/json"
	"net/http"
)

// ── Organization (workspace settings) ───────────────────────
// Holds notifications + branding (dashboard page/meta title) as jsonb.

// GET /api/organization
func (s *server) handleGetOrganization(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	rows, err := s.queryMaps(r.Context(),
		`SELECT id::text AS id, name, settings FROM organizations WHERE id = $1`, a.OrgID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if len(rows) == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	writeJSON(w, rows[0])
}

// PATCH /api/organization {name?, settings?}
// The client loads the full settings object, edits a subtree, and sends it
// back whole (mirrors v1), so settings is replaced when provided.
func (s *server) handleUpdateOrganization(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var b struct {
		Name     string          `json:"name"`
		Settings json.RawMessage `json:"settings"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	_, err := s.pool.Exec(r.Context(),
		`UPDATE organizations SET
		   name = COALESCE(NULLIF($2,''), name),
		   settings = COALESCE($3::jsonb, settings)
		 WHERE id = $1`,
		a.OrgID, b.Name, rawOrNil(b.Settings))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.handleGetOrganization(w, r)
}
