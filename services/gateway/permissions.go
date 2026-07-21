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
		// Managers get everything except role + channel management, and except the
		// org-wide switches that are not theirs to flip: the AI agent + knowledge
		// base configuration, and the organisation record itself.
		switch key {
		case "manage_roles", "manage_channels", "manage_ai", "manage_organization":
			return false
		}
		return true
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

// campaignScoped wraps a handler on /api/campaigns/{id}/... so the caller must have
// access to THAT campaign, not merely permission to use the campaigns feature. The
// two are independent: `gate` answers "may this role touch campaigns at all", this
// answers "which ones". Applied as middleware rather than per-handler because the
// check is identical for all 20+ campaign routes and a new route must not be able to
// forget it. 404 rather than 403: the caller should not learn that a campaign outside
// their scope exists. MUST be used inside requireAuth (it reads the auth context).
func (s *server) campaignScoped(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		a, ok := authFrom(r.Context())
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		if !s.canAccessCampaign(r.Context(), a, r.PathValue("id")) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		next(w, r)
	}
}

// branchScoped is campaignScoped for /api/branches/{id}: a branch inherits the
// visibility of the campaign that owns it, so a caller may only touch branches of
// campaigns they can see. Kept separate because {id} here is a branch id, not a campaign.
func (s *server) branchScoped(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		a, ok := authFrom(r.Context())
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		q := `SELECT EXISTS(SELECT 1 FROM campaign_branches b JOIN campaigns c ON c.id = b.campaign_id
		       WHERE b.id = $1::uuid AND b.organization_id = $2`
		args := []any{r.PathValue("id"), a.OrgID}
		if !orgWideCampaignView(a) {
			q += " AND " + campaignMembershipScope("c", 3)
			args = append(args, a.UserID)
		}
		q += ")"
		var allowed bool
		if err := s.pool.QueryRow(r.Context(), q, args...).Scan(&allowed); err != nil || !allowed {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		next(w, r)
	}
}

// callScoped is campaignScoped for /api/calls/{id}/...: a call belongs to a
// conversation, so it inherits that conversation's visibility. Every one of these
// handlers took a call id straight from the path and looked it up by org alone,
// which meant anyone in the org could accept, reject, end or attach a recording to
// a call in a conversation they cannot even open, just by knowing an id.
// 404 rather than 403, matching guardConversation: the caller should not learn the
// call exists. MUST be used inside requireAuth.
func (s *server) callScoped(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		a, ok := authFrom(r.Context())
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		var convID string
		if err := s.pool.QueryRow(r.Context(),
			`SELECT conversation_id::text FROM calls WHERE id=$1 AND organization_id=$2`,
			r.PathValue("id"), a.OrgID).Scan(&convID); err != nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		if allowed, _ := s.canAccessConversation(r.Context(), a, convID); !allowed {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		next(w, r)
	}
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
