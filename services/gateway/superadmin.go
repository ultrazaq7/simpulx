package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
)

// ── Platform super admin ────────────────────────────────────────────────────
// The super admin is NOT a role. It is a single configured email
// (SUPER_ADMIN_EMAIL, default admin@simpulx.com). It can list every org, create
// orgs, and set each org's Simpuler-credit pool / package. Tenants never see
// this surface: unauthorized callers get 404, not 403.

var slugStripRe = regexp.MustCompile(`[^a-z0-9]+`)

func slugify(name string) string {
	s := slugStripRe.ReplaceAllString(strings.ToLower(strings.TrimSpace(name)), "-")
	s = strings.Trim(s, "-")
	if s == "" {
		s = "org"
	}
	if len(s) > 100 {
		s = s[:100]
	}
	return s
}

// hardcodedSuperAdmins are always platform super admins, independent of any env
// config, so access can't silently break if SUPER_ADMIN_EMAIL is unset/wrong.
var hardcodedSuperAdmins = map[string]bool{"admin@simpulx.com": true}

// isSuperAdmin looks up the caller fresh from the DB (by user id) so a stale or
// forged token claim can't escalate. A user is a platform super admin if their
// email is hardcoded, matches SUPER_ADMIN_EMAIL, OR their role is "superadmin".
// superAdminByEmail is the single source of truth for "is this user the platform
// super admin": a hardcoded email, the SUPER_ADMIN_EMAIL override, or a
// "superadmin" role. Used both for access checks and for the display-only role
// label (the UI shows "Super Admin" without it being a selectable role).
func (s *server) superAdminByEmail(email, role string) bool {
	e := strings.ToLower(strings.TrimSpace(email))
	if hardcodedSuperAdmins[e] {
		return true
	}
	if s.superAdminEmail != "" && strings.EqualFold(e, strings.TrimSpace(s.superAdminEmail)) {
		return true
	}
	return strings.EqualFold(strings.TrimSpace(role), "superadmin")
}

func (s *server) isSuperAdmin(ctx context.Context, a authInfo) bool {
	var email, role string
	if err := s.pool.QueryRow(ctx, `SELECT email, role FROM users WHERE id=$1`, a.UserID).Scan(&email, &role); err != nil {
		return false
	}
	return s.superAdminByEmail(email, role)
}

// requireSuperAdmin gates platform endpoints; non-super-admins get 404 so the
// platform surface stays invisible to tenants.
func (s *server) requireSuperAdmin(next http.HandlerFunc) http.HandlerFunc {
	return s.requireAuth(func(w http.ResponseWriter, r *http.Request) {
		a, _ := authFrom(r.Context())
		if !s.isSuperAdmin(r.Context(), a) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		next(w, r)
	})
}

// GET /api/platform/access — any authed user; tells the UI whether to render the
// Platform surface. The real gate is requireSuperAdmin on every read/write.
func (s *server) handlePlatformAccess(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	writeJSON(w, map[string]any{"super_admin": s.isSuperAdmin(r.Context(), a)})
}

// GET /api/platform/orgs — every org with its full column set.
func (s *server) handleListOrgs(w http.ResponseWriter, r *http.Request) {
	rows, err := s.queryMaps(r.Context(),
		`SELECT o.id, o.name, o.slug, o.created_at,
		        COALESCE(os.package_name,'starter') AS package_name,
		        COALESCE(os.status,'active')        AS status,
		        os.renewal_date,
		        COALESCE(os.quotas, '{"users":10,"simpuler_credits":1000,"custom_fields":20}'::jsonb) AS quotas,
		        (SELECT count(*) FROM users u     WHERE u.organization_id=o.id AND u.status='active') AS users_active,
		        (SELECT count(*) FROM users u     WHERE u.organization_id=o.id)                        AS users_total,
		        (SELECT count(*) FROM campaigns c WHERE c.organization_id=o.id)                        AS campaigns,
		        (SELECT count(*) FROM messages m  WHERE m.organization_id=o.id AND m.sender_type='bot'
		            AND m.created_at >= date_trunc('month', now()))                                    AS credits_used_month
		   FROM organizations o
		   LEFT JOIN org_subscriptions os ON os.organization_id=o.id
		  ORDER BY o.created_at DESC`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

// POST /api/platform/orgs — create an org, its owner user, and its credit pool.
func (s *server) handleCreateOrg(w http.ResponseWriter, r *http.Request) {
	var b struct {
		Name            string `json:"name"`
		OwnerName       string `json:"owner_name"`
		OwnerEmail      string `json:"owner_email"`
		OwnerPassword   string `json:"owner_password"`
		PackageName     string `json:"package_name"`
		Users           *int   `json:"users"`
		SimpulerCredits *int   `json:"simpuler_credits"`
		CustomFields    *int   `json:"custom_fields"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	b.Name = strings.TrimSpace(b.Name)
	b.OwnerEmail = strings.TrimSpace(b.OwnerEmail)
	b.OwnerName = strings.TrimSpace(b.OwnerName)
	if b.Name == "" || b.OwnerEmail == "" || !strings.Contains(b.OwnerEmail, "@") {
		http.Error(w, "company name and a valid owner email are required", http.StatusBadRequest)
		return
	}
	if b.OwnerName == "" {
		b.OwnerName = "Owner"
	}
	if len(b.OwnerPassword) < 8 {
		http.Error(w, "owner password must be at least 8 characters", http.StatusBadRequest)
		return
	}
	hash, err := hashPassword(b.OwnerPassword)
	if err != nil {
		http.Error(w, "hash error", http.StatusInternalServerError)
		return
	}
	if b.PackageName == "" {
		b.PackageName = "starter"
	}
	users, credits, fields := 10, 1000, 20
	if b.Users != nil {
		users = *b.Users
	}
	if b.SimpulerCredits != nil {
		credits = *b.SimpulerCredits
	}
	if b.CustomFields != nil {
		fields = *b.CustomFields
	}
	quotas := fmt.Sprintf(`{"users":%d,"simpuler_credits":%d,"custom_fields":%d}`, users, credits, fields)

	// Find a free slug (append -2, -3, ... on collision).
	base := slugify(b.Name)
	slug := base
	for i := 2; i < 200; i++ {
		var exists bool
		if err := s.pool.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM organizations WHERE slug=$1)`, slug).Scan(&exists); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if !exists {
			break
		}
		slug = fmt.Sprintf("%s-%d", base, i)
	}

	tx, err := s.pool.Begin(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	var orgID string
	if err := tx.QueryRow(r.Context(),
		`INSERT INTO organizations (name, slug) VALUES ($1,$2) RETURNING id::text`, b.Name, slug).Scan(&orgID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if _, err := tx.Exec(r.Context(),
		`INSERT INTO org_subscriptions (organization_id, package_name, quotas)
		 VALUES ($1,$2,$3::jsonb)
		 ON CONFLICT (organization_id) DO UPDATE SET package_name=EXCLUDED.package_name, quotas=EXCLUDED.quotas, updated_at=now()`,
		orgID, b.PackageName, quotas); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	var ownerID string
	if err := tx.QueryRow(r.Context(),
		`INSERT INTO users (organization_id, email, password_hash, full_name, role, status)
		 VALUES ($1,$2,$3,$4,'owner','active') RETURNING id::text`,
		orgID, b.OwnerEmail, hash, b.OwnerName).Scan(&ownerID); err != nil {
		http.Error(w, "could not create owner (email may already be in use): "+err.Error(), http.StatusBadRequest)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.log.Info("platform: org created", "org", orgID, "slug", slug, "owner", b.OwnerEmail)
	writeJSON(w, map[string]any{"id": orgID, "slug": slug, "owner_id": ownerID})
}

// PATCH /api/platform/orgs/{id} — rename + set package/status/renewal/credit pool.
func (s *server) handleUpdateOrg(w http.ResponseWriter, r *http.Request) {
	orgID := r.PathValue("id")
	var b struct {
		Name        string          `json:"name"`
		PackageName string          `json:"package_name"`
		Status      string          `json:"status"`
		RenewalDate string          `json:"renewal_date"`
		Quotas      json.RawMessage `json:"quotas"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(b.Name) != "" {
		if _, err := s.pool.Exec(r.Context(),
			`UPDATE organizations SET name=$2, updated_at=now() WHERE id=$1::uuid`, orgID, strings.TrimSpace(b.Name)); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}
	_, _ = s.pool.Exec(r.Context(),
		`INSERT INTO org_subscriptions (organization_id) VALUES ($1::uuid) ON CONFLICT (organization_id) DO NOTHING`, orgID)
	if _, err := s.pool.Exec(r.Context(),
		`UPDATE org_subscriptions SET
		   package_name = COALESCE(NULLIF($2,''), package_name),
		   status       = COALESCE(NULLIF($3,''), status),
		   renewal_date = COALESCE(NULLIF($4,'')::date, renewal_date),
		   quotas       = COALESCE($5::jsonb, quotas),
		   updated_at   = now()
		 WHERE organization_id=$1::uuid`,
		orgID, b.PackageName, b.Status, b.RenewalDate, rawOrNil(b.Quotas)); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"status": "updated"})
}
