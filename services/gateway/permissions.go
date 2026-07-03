package main

import (
	"context"
	"encoding/json"
	"net/http"
)

// ── Permission enforcement ──────────────────────────────────
// Reads the org's role_permissions matrix (organizations.settings) and gates
// handlers by permission key. owner/admin are always full-access. For other
// roles the effective value is the SAVED matrix value if present, else the
// built-in default.
//
// IMPORTANT: defaultPerm MUST mirror web/lib/permissions.ts defaultFor() and the
// roles settings page, so backend enforcement matches what the UI shows.

var lockedRoles = map[string]bool{"owner": true, "admin": true}

func defaultPerm(role, key string) bool {
	if lockedRoles[role] {
		return true
	}
	switch role {
	case "manager":
		// Managers get everything except role + channel management.
		return key != "manage_roles" && key != "manage_channels"
	case "agent":
		switch key {
		case "menu_dashboard", "menu_chats", "menu_contacts", "menu_settings",
			"view_dashboard", "view_team_chats", "view_contacts", "create_contacts",
			"edit_contacts", "close_chats", "view_settings", "initiate_chats":
			return true
		}
		return false
	}
	// Unknown custom role with no saved entry => deny by default.
	return false
}

// orgMatrix loads the saved role->perm->bool matrix for an org (may be empty).
func (s *server) orgMatrix(ctx context.Context, orgID string) map[string]map[string]bool {
	var raw []byte
	if err := s.pool.QueryRow(ctx, `SELECT settings FROM organizations WHERE id=$1`, orgID).Scan(&raw); err != nil {
		return nil
	}
	var settings map[string]json.RawMessage
	if err := json.Unmarshal(raw, &settings); err != nil {
		return nil
	}
	rp, ok := settings["role_permissions"]
	if !ok {
		return nil
	}
	var doc rolePermissionsDoc
	if err := json.Unmarshal(rp, &doc); err != nil {
		return nil
	}
	return doc.Matrix
}

// hasPerm reports whether the caller's role is granted `key`.
func (s *server) hasPerm(ctx context.Context, a authInfo, key string) bool {
	if lockedRoles[a.Role] {
		return true
	}
	if m := s.orgMatrix(ctx, a.OrgID); m != nil {
		if perms, ok := m[a.Role]; ok {
			if v, ok := perms[key]; ok {
				return v
			}
		}
	}
	return defaultPerm(a.Role, key)
}

// gate wraps a handler, requiring permission `key`. MUST be used inside
// requireAuth (it reads the auth context). Denied => 403.
func (s *server) gate(key string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		a, ok := authFrom(r.Context())
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		if !s.hasPerm(r.Context(), a, key) {
			http.Error(w, "forbidden: missing permission '"+key+"'", http.StatusForbidden)
			return
		}
		next(w, r)
	}
}
