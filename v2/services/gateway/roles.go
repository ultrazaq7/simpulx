package main

import (
	"encoding/json"
	"net/http"
)

// ── Role permissions ────────────────────────────────────────
// A permission matrix (role -> permission key -> bool) plus optional custom role
// labels. Stored as jsonb under organizations.settings.role_permissions so no new
// table is needed. owner/admin are always implicitly full-access and are not
// persisted; the client renders them as locked-on. Mirrors v1's
// /organization/role-permissions contract.

type rolePermissionsDoc struct {
	Matrix      map[string]map[string]bool `json:"matrix"`
	CustomRoles map[string]string          `json:"custom_roles"` // key -> display label
}

// GET /api/role-permissions
func (s *server) handleGetRolePermissions(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var settings map[string]json.RawMessage
	var raw []byte
	err := s.pool.QueryRow(r.Context(),
		`SELECT settings FROM organizations WHERE id = $1`, a.OrgID).Scan(&raw)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	_ = json.Unmarshal(raw, &settings)

	doc := rolePermissionsDoc{Matrix: map[string]map[string]bool{}, CustomRoles: map[string]string{}}
	if rp, ok := settings["role_permissions"]; ok {
		_ = json.Unmarshal(rp, &doc)
	}
	if doc.Matrix == nil {
		doc.Matrix = map[string]map[string]bool{}
	}
	if doc.CustomRoles == nil {
		doc.CustomRoles = map[string]string{}
	}
	writeJSON(w, doc)
}

// PUT /api/role-permissions {matrix, custom_roles}
// Admin/owner only. owner/admin entries are dropped before saving (always full).
func (s *server) handleUpdateRolePermissions(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	if a.Role != "admin" && a.Role != "owner" {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	var doc rolePermissionsDoc
	if err := json.NewDecoder(r.Body).Decode(&doc); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if doc.Matrix == nil {
		doc.Matrix = map[string]map[string]bool{}
	}
	delete(doc.Matrix, "owner")
	delete(doc.Matrix, "admin")
	if doc.CustomRoles == nil {
		doc.CustomRoles = map[string]string{}
	}

	payload, err := json.Marshal(doc)
	if err != nil {
		http.Error(w, "encode error", http.StatusInternalServerError)
		return
	}
	// Merge into settings jsonb without clobbering other keys (branding, etc).
	_, err = s.pool.Exec(r.Context(),
		`UPDATE organizations
		    SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object('role_permissions', $2::jsonb)
		  WHERE id = $1`,
		a.OrgID, string(payload))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.audit(r.Context(), a, "updated", "role_permissions", a.OrgID, nil)
	writeJSON(w, doc)
}
