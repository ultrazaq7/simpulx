package main

import (
	"encoding/json"
	"net/http"
)

// ── Simpuler credits: org subscription pool + per-campaign allocation (WS-F / Phase 10) ──
// 1 credit = 1 Simpuler (AI) reply. Broadcasts/agent sends are a separate cost line.

// GET /api/subscription — the org's package + quotas + real used counts.
func (s *server) handleGetSubscription(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	// Lazy-ensure a row for orgs created after the migration.
	_, _ = s.pool.Exec(r.Context(),
		`INSERT INTO org_subscriptions (organization_id) VALUES ($1) ON CONFLICT (organization_id) DO NOTHING`, a.OrgID)
	rows, err := s.queryMaps(r.Context(),
		`SELECT os.package_name, os.status, os.renewal_date, os.quotas,
		        (SELECT count(*) FROM users WHERE organization_id=$1 AND status='active') AS used_users,
		        (SELECT count(*) FROM messages WHERE organization_id=$1 AND sender_type='bot'
		           AND created_at >= date_trunc('month', now())) AS used_simpuler_credits,
		        (SELECT count(*) FROM custom_fields WHERE organization_id=$1) AS used_custom_fields
		   FROM org_subscriptions os WHERE os.organization_id=$1`, a.OrgID)
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

// PATCH /api/subscription — owner updates package/status/renewal/quotas.
func (s *server) handleUpdateSubscription(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	if a.Role != "owner" {
		http.Error(w, "owner only", http.StatusForbidden)
		return
	}
	var b struct {
		PackageName string          `json:"package_name"`
		Status      string          `json:"status"`
		RenewalDate string          `json:"renewal_date"`
		Quotas      json.RawMessage `json:"quotas"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	_, _ = s.pool.Exec(r.Context(),
		`INSERT INTO org_subscriptions (organization_id) VALUES ($1) ON CONFLICT (organization_id) DO NOTHING`, a.OrgID)
	_, err := s.pool.Exec(r.Context(),
		`UPDATE org_subscriptions SET
		   package_name = COALESCE(NULLIF($2,''), package_name),
		   status = COALESCE(NULLIF($3,''), status),
		   renewal_date = COALESCE(NULLIF($4,'')::date, renewal_date),
		   quotas = COALESCE($5::jsonb, quotas),
		   updated_at = now()
		 WHERE organization_id=$1`,
		a.OrgID, b.PackageName, b.Status, b.RenewalDate, rawOrNil(b.Quotas))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"status": "updated"})
}

// GET /api/campaigns/{id}/credits — allocation + usage for one campaign.
func (s *server) handleGetCampaignCredits(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	cid := r.PathValue("id")
	_, _ = s.pool.Exec(r.Context(),
		`INSERT INTO campaign_credits (campaign_id)
		   SELECT id FROM campaigns WHERE id=$1::uuid AND organization_id=$2
		 ON CONFLICT (campaign_id) DO NOTHING`, cid, a.OrgID)
	rows, err := s.queryMaps(r.Context(),
		`SELECT cc.allocated_credits, cc.used_credits, cc.low_balance_threshold,
		        (cc.allocated_credits - cc.used_credits) AS remaining_credits
		   FROM campaign_credits cc JOIN campaigns c ON c.id=cc.campaign_id
		  WHERE cc.campaign_id=$1::uuid AND c.organization_id=$2`, cid, a.OrgID)
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

// POST /api/campaigns/{id}/credits/allocate {allocated_credits, low_balance_threshold?}
func (s *server) handleAllocateCampaignCredits(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	cid := r.PathValue("id")
	var b struct {
		AllocatedCredits    *int `json:"allocated_credits"`
		LowBalanceThreshold *int `json:"low_balance_threshold"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	tag, err := s.pool.Exec(r.Context(),
		`INSERT INTO campaign_credits (campaign_id, allocated_credits, low_balance_threshold)
		   SELECT id, COALESCE($3,0), COALESCE($4,50) FROM campaigns WHERE id=$1::uuid AND organization_id=$2
		 ON CONFLICT (campaign_id) DO UPDATE SET
		   allocated_credits = COALESCE($3, campaign_credits.allocated_credits),
		   low_balance_threshold = COALESCE($4, campaign_credits.low_balance_threshold),
		   updated_at = now()`,
		cid, a.OrgID, b.AllocatedCredits, b.LowBalanceThreshold)
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

// GET /api/campaigns/{id}/usage — daily Simpuler-reply counts (last 30 days) for the chart.
func (s *server) handleCampaignUsage(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	cid := r.PathValue("id")
	rows, err := s.queryMaps(r.Context(),
		`SELECT to_char(date_trunc('day', m.created_at), 'YYYY-MM-DD') AS day, count(*)::int AS credits
		   FROM messages m JOIN conversations cv ON cv.id=m.conversation_id
		  WHERE m.organization_id=$1 AND m.sender_type='bot' AND cv.campaign_id=$2::uuid
		    AND m.created_at >= now() - interval '30 days'
		  GROUP BY 1 ORDER BY 1`, a.OrgID, cid)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}
