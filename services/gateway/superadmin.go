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
		`SELECT o.id::text AS id, o.name, o.slug, o.created_at,
		        COALESCE(os.package_name,'starter') AS package_name,
		        COALESCE(os.status,'active')        AS status,
		        os.renewal_date,
		        COALESCE(os.quotas, '{"users":10,"simpuler_credits":1000,"custom_fields":20}'::jsonb) AS quotas,
		        (SELECT count(*) FROM users u     WHERE u.organization_id=o.id AND u.status='active') AS users_active,
		        (SELECT count(*) FROM users u     WHERE u.organization_id=o.id)                        AS users_total,
		        (SELECT count(*) FROM campaigns c WHERE c.organization_id=o.id)                        AS campaigns,
		        (SELECT count(*) FROM messages m  WHERE m.organization_id=o.id AND m.sender_type='bot'
		            AND m.created_at >= date_trunc('month', now()))                                    AS credits_used_month,
		        (SELECT u.email FROM users u WHERE u.organization_id=o.id AND u.role='owner'
		            ORDER BY u.created_at LIMIT 1)                                                      AS owner_email
		   FROM organizations o
		   LEFT JOIN org_subscriptions os ON os.organization_id=o.id
		  ORDER BY o.created_at DESC`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

// GET /api/platform/ml-monitor — model health for the founders (P7 internal tool).
// Aggregates purely from Postgres (no ai-agent file access needed): score coverage,
// distribution, the model versions actually in use, and the Next Best Action mix.
// Lets a founder see "is the decision engine live and sane" at a glance.
func (s *server) handleMlMonitor(w http.ResponseWriter, r *http.Request) {
	scores, err := s.queryMaps(r.Context(),
		`SELECT
		   count(*) FILTER (WHERE lead_score IS NOT NULL)                 AS lead_scored,
		   count(*) FILTER (WHERE closing_probability IS NOT NULL)        AS closing_scored,
		   count(*) FILTER (WHERE next_best_action IS NOT NULL)           AS nba_set,
		   count(*)                                                       AS total_convs,
		   COALESCE(round(avg(lead_score)::numeric,1),0)::float8          AS lead_score_avg,
		   COALESCE(round(avg(closing_probability)::numeric,1),0)::float8 AS closing_avg,
		   count(*) FILTER (WHERE lead_score >= 75)                       AS lead_hot,
		   count(*) FILTER (WHERE lead_score >= 50 AND lead_score < 75)   AS lead_mid,
		   count(*) FILTER (WHERE lead_score < 50)                        AS lead_low,
		   count(*) FILTER (WHERE closing_probability >= 70)              AS closing_hot,
		   count(*) FILTER (WHERE closing_probability >= 40 AND closing_probability < 70) AS closing_mid,
		   count(*) FILTER (WHERE closing_probability < 40)               AS closing_low
		 FROM conversations`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	versions, _ := s.queryMaps(r.Context(),
		`SELECT 'lead_score' AS model, COALESCE(lead_score_model_version,'(none)') AS version, count(*) AS n
		   FROM conversations WHERE lead_score IS NOT NULL GROUP BY 2
		 UNION ALL
		 SELECT 'closing', COALESCE(closing_prob_model_version,'(none)'), count(*)
		   FROM conversations WHERE closing_probability IS NOT NULL GROUP BY 2
		 ORDER BY 1, 3 DESC`)
	nba, _ := s.queryMaps(r.Context(),
		`SELECT next_best_action AS action, count(*) AS n
		   FROM conversations WHERE next_best_action IS NOT NULL
		  GROUP BY 1 ORDER BY 2 DESC`)
	first := map[string]any{}
	if len(scores) > 0 {
		first = scores[0]
	}
	writeJSON(w, map[string]any{"scores": first, "versions": versions, "nba": nba})
}

// GET /api/platform/campaigns — every campaign across all orgs (for the clone +
// prompt-history tools). Lightweight: id, name, org, catalog size.
func (s *server) handleListAllCampaigns(w http.ResponseWriter, r *http.Request) {
	rows, err := s.queryMaps(r.Context(),
		`SELECT c.id::text AS id, c.name, o.name AS org_name, c.status,
		        (SELECT count(*) FROM campaign_catalog cc WHERE cc.campaign_id=c.id) AS catalog_rows
		   FROM campaigns c JOIN organizations o ON o.id=c.organization_id
		  ORDER BY o.name, c.name`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

// GET /api/platform/campaigns/{id}/ai-history — the AI style/prompt version history
// for a campaign (P7 prompt versioning), newest first.
func (s *server) handleCampaignAIHistory(w http.ResponseWriter, r *http.Request) {
	rows, err := s.queryMaps(r.Context(),
		`SELECT h.id::text AS id, h.ai_style, h.changed_at,
		        COALESCE(u.full_name, u.email, '') AS changed_by
		   FROM campaign_ai_history h
		   LEFT JOIN users u ON u.id = h.changed_by
		  WHERE h.campaign_id = $1
		  ORDER BY h.changed_at DESC LIMIT 50`, r.PathValue("id"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

// POST /api/platform/campaigns/{id}/clone — duplicate a campaign's full AI config
// (P7 internal tool). Copies the config columns + catalog + agent rotation into a
// new campaign in the SAME org. keywords + ad_source_ids are deliberately left
// empty: they are unique per-org routing/tracking params, so copying them would
// make two campaigns fight over the same leads. The clone lands inactive-safe (no
// keywords => routes nothing) until the operator wires its own keywords.
func (s *server) handleCloneCampaign(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	src := r.PathValue("id")
	tx, err := s.pool.Begin(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	var newID string
	err = tx.QueryRow(r.Context(),
		`INSERT INTO campaigns
		   (organization_id, name, dealer_name, routing_strategy, channel_id, calling_enabled,
		    segment, brand, ai_auto_reply, ai_language, ai_dynamic_language, intake_form_id, ai_smart_summary,
		    ai_style, covered_cities, followup_template_id, followup_frequency, monthly_budget, avg_deal_value,
		    keywords, ad_source_ids)
		 SELECT organization_id, left(name || ' (copy)', 200), dealer_name, routing_strategy, channel_id, calling_enabled,
		    segment, brand, ai_auto_reply, ai_language, ai_dynamic_language, intake_form_id, ai_smart_summary,
		    ai_style, covered_cities, followup_template_id, followup_frequency, monthly_budget, avg_deal_value,
		    '{}'::text[], '{}'::text[]
		   FROM campaigns WHERE id=$1
		 RETURNING id::text`, src).Scan(&newID)
	if err != nil {
		http.Error(w, "clone failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	// Catalog (the campaign's grounded pricelist) and agent rotation come along so
	// the clone is usable immediately, not an empty shell.
	if _, err := tx.Exec(r.Context(),
		`INSERT INTO campaign_catalog (campaign_id, segment, item_name, variant_name, location_name, category_type, headline_price, attributes)
		 SELECT $1, segment, item_name, variant_name, location_name, category_type, headline_price, attributes
		   FROM campaign_catalog WHERE campaign_id=$2`, newID, src); err != nil {
		http.Error(w, "clone catalog failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if _, err := tx.Exec(r.Context(),
		`INSERT INTO campaign_agents (campaign_id, user_id, in_rotation)
		 SELECT $1, user_id, in_rotation FROM campaign_agents WHERE campaign_id=$2
		 ON CONFLICT DO NOTHING`, newID, src); err != nil {
		http.Error(w, "clone agents failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.audit(r.Context(), a, "cloned", "campaign", newID, map[string]any{"source": src})
	writeJSON(w, map[string]any{"id": newID})
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
	// Seed the default pipeline + outcome dispositions so the new org has a
	// working inbox/CRM from the first login (see migration 0086).
	if _, err := tx.Exec(r.Context(), `SELECT seed_org_pipeline($1::uuid)`, orgID); err != nil {
		http.Error(w, "could not seed pipeline: "+err.Error(), http.StatusInternalServerError)
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
		OwnerEmail  string          `json:"owner_email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	// Owner email (credit alerts + login) is editable here so a superadmin can fix a
	// typo or hand an org over. Updates the org's owner user in place.
	if e := strings.TrimSpace(b.OwnerEmail); e != "" {
		if _, err := s.pool.Exec(r.Context(),
			`UPDATE users SET email=lower($2), updated_at=now()
			  WHERE organization_id=$1::uuid AND role='owner'`, orgID, e); err != nil {
			http.Error(w, "owner email: "+err.Error(), http.StatusBadRequest)
			return
		}
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

// DELETE /api/platform/orgs/{id} — permanently remove an org and everything under
// it (cascades). Super admin only; you cannot delete your own organization.
func (s *server) handleDeleteOrg(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	orgID := r.PathValue("id")
	if orgID == a.OrgID {
		http.Error(w, "you cannot delete your own organization", http.StatusBadRequest)
		return
	}
	tag, err := s.pool.Exec(r.Context(), `DELETE FROM organizations WHERE id=$1::uuid`, orgID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	s.log.Info("platform: org deleted", "org", orgID)
	writeJSON(w, map[string]any{"status": "deleted"})
}
