package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"
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
		        COALESCE(o.settings->>'industry','') AS industry,
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
		  -- The platform's own org is not a client. It exists only because
		  -- users.organization_id is NOT NULL and the super admin needs a home
		  -- outside any tenant; listing it here would put Simpulx in its own
		  -- customer list and, once P6 billing sweeps orgs, invoice itself.
		  -- Flagged in settings rather than matched on slug so renaming the org
		  -- cannot quietly turn it back into a "client".
		  WHERE COALESCE(o.settings->>'is_platform','') <> 'true'
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

	// AI usage: token + cost totals (all-time + last 30d) from the llm_usage ledger.
	usage, _ := s.queryMaps(r.Context(),
		`SELECT
		   COALESCE(sum(cost_usd),0)::float8                                          AS cost_usd_all,
		   COALESCE(sum(cost_usd) FILTER (WHERE created_at >= now()-interval '30 days'),0)::float8 AS cost_usd_30d,
		   COALESCE(sum(tokens_in),0)::bigint                                         AS tokens_in,
		   COALESCE(sum(tokens_out),0)::bigint                                        AS tokens_out,
		   count(*)::bigint                                                           AS calls_all,
		   count(*) FILTER (WHERE created_at >= now()-interval '30 days')::bigint     AS calls_30d
		 FROM llm_usage`)
	byFeature, _ := s.queryMaps(r.Context(),
		`SELECT feature, count(*) AS calls, COALESCE(sum(cost_usd),0)::float8 AS cost_usd
		   FROM llm_usage GROUP BY feature ORDER BY cost_usd DESC`)
	byModel, _ := s.queryMaps(r.Context(),
		`SELECT model, count(*) AS calls, COALESCE(sum(cost_usd),0)::float8 AS cost_usd
		   FROM llm_usage GROUP BY model ORDER BY cost_usd DESC`)

	// Profit monitor (ESTIMATE). Revenue = billable AI replies (nurture/reply/
	// followup = "1 credit = 1 AI reply") x charge price; cost = real cost_usd. Both
	// per org, this billing month. Constants are estimates a founder can eyeball.
	profit, _ := s.queryMaps(r.Context(),
		`SELECT o.name AS org,
		        count(*) FILTER (WHERE u.feature IN ('nurture','reply','followup'))::bigint AS credits,
		        COALESCE(sum(u.cost_usd),0)::float8 AS cost_usd,
		        (count(*) FILTER (WHERE u.feature IN ('nurture','reply','followup')) * `+capiCreditPriceIDR+`
		           - COALESCE(sum(u.cost_usd),0) * `+capiUSDIDR+`)::float8 AS profit_idr
		   FROM llm_usage u JOIN organizations o ON o.id = u.organization_id
		  WHERE u.created_at >= date_trunc('month', now())
		  GROUP BY o.name ORDER BY profit_idr DESC`)

	writeJSON(w, map[string]any{
		"scores": first, "versions": versions, "nba": nba,
		"usage": func() map[string]any {
			if len(usage) > 0 {
				return usage[0]
			}
			return map[string]any{}
		}(),
		"byFeature": byFeature, "byModel": byModel, "profit": profit,
		"creditPriceIdr": capiCreditPriceIDR, "usdIdr": capiUSDIDR,
	})
}

// Estimate constants for the profit monitor (documented, easy to tune). Charge
// price per AI credit (what customers pay) and USD->IDR for converting cost_usd.
const capiCreditPriceIDR = "200"
const capiUSDIDR = "16000"

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

// POST /api/platform/orgs — create an org, its owner user, and its credit pool.
// Thin wrapper over createOrganization so the wizard and signup approval create
// orgs through one path instead of two copies that drift.
func (s *server) handleCreateOrg(w http.ResponseWriter, r *http.Request) {
	var b struct {
		Name            string `json:"name"`
		Industry        string `json:"industry"` // segment vocabulary (see segments.py)
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
	if len(b.OwnerPassword) > 0 && len(b.OwnerPassword) < 8 {
		http.Error(w, "owner password must be at least 8 characters", http.StatusBadRequest)
		return
	}
	in := createOrgInput{
		Name: b.Name, Industry: b.Industry,
		OwnerName: b.OwnerName, OwnerEmail: b.OwnerEmail, OwnerPassword: b.OwnerPassword,
		PackageName: b.PackageName,
		Users:       10, SimpulerCredits: 1000, CustomFields: 20,
		// No explicit password = the owner sets their own via the welcome link.
		SendWelcome: b.OwnerPassword == "",
	}
	if b.Users != nil {
		in.Users = *b.Users
	}
	if b.SimpulerCredits != nil {
		in.SimpulerCredits = *b.SimpulerCredits
	}
	if b.CustomFields != nil {
		in.CustomFields = *b.CustomFields
	}
	orgID, ownerID, err := s.createOrganization(r.Context(), in)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	var slug string
	_ = s.pool.QueryRow(r.Context(), `SELECT slug FROM organizations WHERE id=$1::uuid`, orgID).Scan(&slug)
	s.log.Info("platform: org created", "org", orgID, "slug", slug)
	writeJSON(w, map[string]any{"id": orgID, "slug": slug, "owner_id": ownerID})
}

// PATCH /api/platform/orgs/{id} — rename + set package/status/renewal/credit pool.
func (s *server) handleUpdateOrg(w http.ResponseWriter, r *http.Request) {
	orgID := r.PathValue("id")
	var b struct {
		Name        string          `json:"name"`
		Industry    *string         `json:"industry"` // org segment; gates segment-only surfaces
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
	//
	// This used to be a bare UPDATE ... WHERE role='owner', which assumed an org has
	// exactly one owner. Nothing enforces that, and an org with two owners made the
	// statement try to give BOTH rows the same address -- so it collided with itself
	// on UNIQUE (organization_id, email) and surfaced a raw Postgres error to the
	// superadmin. Resolve the target row first, and fail with a sentence a human can
	// act on instead of a SQLSTATE.
	if e := strings.ToLower(strings.TrimSpace(b.OwnerEmail)); e != "" {
		var ownerID, currentEmail string
		var owners int
		if err := s.pool.QueryRow(r.Context(),
			`SELECT count(*) FROM users
			  WHERE organization_id=$1::uuid AND role='owner' AND NOT is_deleted`, orgID).Scan(&owners); err != nil {
			http.Error(w, "owner email: could not read the organisation's owners", http.StatusInternalServerError)
			return
		}
		switch {
		case owners == 0:
			http.Error(w, "owner email: this organisation has no active owner account to update", http.StatusConflict)
			return
		case owners > 1:
			http.Error(w, "owner email: this organisation has more than one owner, so it is ambiguous which one to rename. Fix the duplicate owner in Team first.", http.StatusConflict)
			return
		}
		if err := s.pool.QueryRow(r.Context(),
			`SELECT id::text, email FROM users
			  WHERE organization_id=$1::uuid AND role='owner' AND NOT is_deleted LIMIT 1`, orgID).Scan(&ownerID, &currentEmail); err != nil {
			http.Error(w, "owner email: could not read the owner account", http.StatusInternalServerError)
			return
		}
		// Lockout guard. The platform panel can rename the very account that grants
		// access to the platform panel: superadmin identity is resolved from the
		// EMAIL (hardcoded, or SUPER_ADMIN_EMAIL), so renaming it away silently
		// removes the only way back in. That is not hypothetical -- it happened on
		// 2026-07-21 and had to be undone from the server.
		if !strings.EqualFold(currentEmail, e) &&
			s.superAdminByEmail(currentEmail, "") && !s.superAdminByEmail(e, "") {
			http.Error(w, "owner email: "+currentEmail+" is the platform super admin. "+
				"Renaming it to an address that is not recognised as super admin would lock you out. "+
				"Point SUPER_ADMIN_EMAIL at the new address first.", http.StatusConflict)
			return
		}
		if !strings.EqualFold(currentEmail, e) {
			// Someone else in this org may already hold the address; say so plainly
			// rather than letting the unique index answer.
			var taken bool
			if err := s.pool.QueryRow(r.Context(),
				`SELECT EXISTS(SELECT 1 FROM users
				                WHERE organization_id=$1::uuid AND lower(email)=$2 AND id <> $3::uuid)`,
				orgID, e, ownerID).Scan(&taken); err == nil && taken {
				http.Error(w, "owner email: another user in this organisation already uses "+e, http.StatusConflict)
				return
			}
			if _, err := s.pool.Exec(r.Context(),
				`UPDATE users SET email=$2, updated_at=now() WHERE id=$1::uuid`, ownerID, e); err != nil {
				s.log.Warn("superadmin: owner email update failed", "org", orgID, "err", err)
				http.Error(w, "owner email: could not be updated", http.StatusBadRequest)
				return
			}
		}
	}
	// Industry (org segment) is owned by this panel; merged into settings so the rest
	// of the settings bag (locale, working hours, ...) is preserved.
	if b.Industry != nil {
		if _, err := s.pool.Exec(r.Context(),
			`UPDATE organizations
			    SET settings = COALESCE(settings,'{}'::jsonb) || jsonb_build_object('industry', $2::text),
			        updated_at = now()
			  WHERE id=$1::uuid`, orgID, strings.TrimSpace(*b.Industry)); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
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

// ── Impersonation ("view as") ───────────────────────────────────────────────
//
// A superadmin belongs to ONE organisation, and every tenant endpoint scopes on
// the org id carried in the JWT. So the Platform panel could list every org but
// never open one: the inbox, campaigns and dashboards always resolved back to the
// superadmin's own tenant. This mints a token for the target org instead, which
// is the only way that scoping can be redirected without weakening it everywhere.
//
// Sessions are FULL ACCESS on purpose: support has to be able to finish a
// customer's setup, not just look at it. The safeguards are therefore attribution
// and time rather than permission: the token is short-lived, it is never
// refreshable, each issue is audited, and every action taken during the session is
// recorded against the SUPERADMIN (see audit) instead of the borrowed account.

// impersonationTTL is short on purpose: a forgotten tab must stop working.
const impersonationTTL = 30 * time.Minute

// POST /api/platform/orgs/{id}/impersonate
func (s *server) handleImpersonateOrg(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	orgID := r.PathValue("id")

	// Refuse to nest: an impersonated session must not be able to hop onward into
	// a third org, which would make the audit trail meaningless.
	if a.ImpersonatedBy != "" {
		http.Error(w, "already impersonating", http.StatusConflict)
		return
	}

	var orgName string
	if err := s.pool.QueryRow(r.Context(),
		`SELECT name FROM organizations WHERE id=$1::uuid`, orgID).Scan(&orgName); err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	// Borrow the org's owner: it is the account with the widest view, so the
	// superadmin sees what the customer sees rather than a partial picture.
	var targetID, targetName, targetRole string
	if err := s.pool.QueryRow(r.Context(),
		`SELECT id::text, full_name, role FROM users
		  WHERE organization_id=$1::uuid AND NOT is_deleted AND status='active'
		  ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, created_at
		  LIMIT 1`, orgID).Scan(&targetID, &targetName, &targetRole); err != nil {
		http.Error(w, "this organisation has no active account to view as", http.StatusConflict)
		return
	}

	token, err := s.issueImpersonationToken(a.UserID, targetID, orgID, targetRole, targetName, impersonationTTL)
	if err != nil {
		http.Error(w, "could not issue token", http.StatusInternalServerError)
		return
	}

	// Audit BEFORE handing the token over, so the record exists even if the
	// response never reaches the browser.
	s.audit(r.Context(), a, "impersonated", "organization", orgID, map[string]any{
		"org_name":    orgName,
		"viewed_as":   targetName,
		"target_role": targetRole,
		"expires_in":  impersonationTTL.String(),
	})
	s.log.Info("superadmin impersonation issued",
		"superadmin", a.UserID, "org", orgID, "org_name", orgName, "as", targetID)

	writeJSON(w, map[string]any{
		"token":      token,
		"expires_in": int(impersonationTTL.Seconds()),
		"org":        map[string]any{"id": orgID, "name": orgName},
		"viewing_as": map[string]any{"id": targetID, "name": targetName, "role": targetRole},
	})
}

// createOrgInput / createOrganization is handleCreateOrg's body, extracted so
// signup approval can create an organisation through the exact same path the
// platform wizard uses -- same slug logic, same subscription upsert, same
// pipeline seeding -- instead of a second, slightly different copy that drifts.
type createOrgInput struct {
	Name, Industry         string
	OwnerName, OwnerEmail  string
	OwnerPassword          string // empty = throwaway; owner sets one via welcome link
	PackageName            string
	Users, SimpulerCredits int
	CustomFields           int
	SubscriptionStatus     string // "" = column default; signup approval sets active|trial
	RenewalDate            string // YYYY-MM-DD; trial end for trials
	SendWelcome            bool
}

func (s *server) createOrganization(ctx context.Context, in createOrgInput) (orgID, ownerID string, err error) {
	in.Name = strings.TrimSpace(in.Name)
	in.OwnerEmail = strings.ToLower(strings.TrimSpace(in.OwnerEmail))
	if in.Name == "" || !strings.Contains(in.OwnerEmail, "@") {
		return "", "", fmt.Errorf("company name and a valid owner email are required")
	}
	if in.OwnerName == "" {
		in.OwnerName = "Owner"
	}
	if in.OwnerPassword == "" {
		in.OwnerPassword = randomPassword()
	}
	hash, err := hashPassword(in.OwnerPassword)
	if err != nil {
		return "", "", err
	}
	if in.PackageName == "" {
		in.PackageName = "starter"
	}
	if in.Users <= 0 {
		in.Users = 10
	}
	if in.SimpulerCredits < 0 {
		in.SimpulerCredits = 0
	}
	if in.CustomFields <= 0 {
		in.CustomFields = 20
	}
	// A user with this email anywhere blocks creation: login matches on email
	// ALONE (no org scoping), so a cross-org duplicate would make sign-in pick a
	// row arbitrarily. Refusing here keeps that invariant true.
	var taken bool
	if err := s.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM users WHERE lower(email)=$1 AND NOT is_deleted)`,
		in.OwnerEmail).Scan(&taken); err == nil && taken {
		return "", "", fmt.Errorf("email %s is already in use", in.OwnerEmail)
	}

	quotas := fmt.Sprintf(`{"users":%d,"simpuler_credits":%d,"custom_fields":%d}`,
		in.Users, in.SimpulerCredits, in.CustomFields)

	base := slugify(in.Name)
	slug := base
	for i := 2; i < 200; i++ {
		var exists bool
		if err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM organizations WHERE slug=$1)`, slug).Scan(&exists); err != nil {
			return "", "", err
		}
		if !exists {
			break
		}
		slug = fmt.Sprintf("%s-%d", base, i)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", "", err
	}
	defer tx.Rollback(ctx)

	if err := tx.QueryRow(ctx,
		`INSERT INTO organizations (name, slug, settings)
		 VALUES ($1,$2, jsonb_build_object('industry', $3::text)) RETURNING id::text`,
		in.Name, slug, strings.TrimSpace(in.Industry)).Scan(&orgID); err != nil {
		return "", "", err
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO org_subscriptions (organization_id, package_name, quotas, status, renewal_date)
		 VALUES ($1,$2,$3::jsonb, COALESCE(NULLIF($4,''),'active'), NULLIF($5,'')::date)
		 ON CONFLICT (organization_id) DO UPDATE
		   SET package_name=EXCLUDED.package_name, quotas=EXCLUDED.quotas,
		       status=EXCLUDED.status, renewal_date=EXCLUDED.renewal_date, updated_at=now()`,
		orgID, in.PackageName, quotas, in.SubscriptionStatus, in.RenewalDate); err != nil {
		return "", "", err
	}
	if err := tx.QueryRow(ctx,
		`INSERT INTO users (organization_id, email, password_hash, full_name, role, status)
		 VALUES ($1,$2,$3,$4,'owner','active') RETURNING id::text`,
		orgID, in.OwnerEmail, hash, in.OwnerName).Scan(&ownerID); err != nil {
		return "", "", fmt.Errorf("could not create owner (email may already be in use): %w", err)
	}
	if _, err := tx.Exec(ctx, `SELECT seed_org_pipeline($1::uuid)`, orgID); err != nil {
		return "", "", fmt.Errorf("could not seed pipeline: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return "", "", err
	}

	if in.SendWelcome {
		// Same welcome flow team invites use: a set-password link, so no password
		// ever travels through email, chat or an operator's clipboard.
		if link, lerr := s.issueSetupLink(ctx, ownerID, 7*24*time.Hour); lerr != nil {
			s.log.Error("welcome setup link failed", "err", lerr)
		} else if sent, mailErr := s.sendMail(in.OwnerEmail, "Welcome to Simpulx - set your password",
			welcomeEmailHTML(in.OwnerName, link, in.OwnerEmail)); mailErr != nil || !sent {
			s.log.Warn("welcome email not delivered", "email", in.OwnerEmail, "sent", sent, "err", mailErr)
		}
	}
	s.log.Info("organization created", "org", orgID, "slug", slug, "owner", in.OwnerEmail)
	return orgID, ownerID, nil
}
