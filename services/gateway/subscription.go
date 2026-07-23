package main

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// ── Simpuler credits: org subscription pool + per-campaign allocation (WS-F / Phase 10) ──
// 1 credit = 1 Simpuler (AI) reply. Broadcasts/agent sends are a separate cost line.

// GET /api/subscription — the org's package + quotas + real used counts.
func (s *server) handleGetSubscription(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	// Lazy-ensure a row for orgs created after the migration.
	_, _ = s.pool.Exec(r.Context(),
		`INSERT INTO org_subscriptions (organization_id) VALUES ($1) ON CONFLICT (organization_id) DO NOTHING`, a.OrgID)
	// used_simpuler_credits comes from the DEBIT LEDGER (campaign_credits), the
	// same numbers the per-campaign Credits & Usage tab shows — it used to count
	// bot messages this month instead, so the org header and the per-campaign
	// tabs told different stories about the same thing.
	rows, err := s.queryMaps(r.Context(),
		`SELECT os.package_name, os.status, os.renewal_date, os.quotas,
		        (SELECT count(*) FROM users WHERE organization_id=$1 AND status='active') AS used_users,
		        COALESCE((SELECT sum(cc.used_credits) FROM campaign_credits cc
		                    JOIN campaigns c ON c.id = cc.campaign_id
		                   WHERE c.organization_id=$1), 0) AS used_simpuler_credits,
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
		        (cc.allocated_credits - cc.used_credits) AS remaining_credits,
		        -- Org-wide monthly Simpuler-credit pool (subscription quota) and how
		        -- much is already allocated to OTHER campaigns, so a campaign can never
		        -- be given more than the org actually has left to hand out.
		        COALESCE((SELECT (quotas->>'simpuler_credits')::int
		                    FROM org_subscriptions WHERE organization_id=$2), 0) AS org_total_credits,
		        COALESCE((SELECT sum(cc2.allocated_credits)::int
		                    FROM campaign_credits cc2 JOIN campaigns c2 ON c2.id=cc2.campaign_id
		                   WHERE c2.organization_id=$2 AND cc2.campaign_id <> $1::uuid), 0) AS allocated_elsewhere
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
	// Cap: a campaign can't be allocated more than the org's remaining pool
	// (org total Simpuler credits minus what's already allocated to OTHER
	// campaigns). Without this the sum of allocations could exceed the pool the
	// org actually pays for.
	if b.AllocatedCredits != nil {
		var orgTotal, allocElsewhere int
		_ = s.pool.QueryRow(r.Context(),
			`SELECT COALESCE((SELECT (quotas->>'simpuler_credits')::int
			                    FROM org_subscriptions WHERE organization_id=$1), 0),
			        COALESCE((SELECT sum(cc2.allocated_credits)::int
			                    FROM campaign_credits cc2 JOIN campaigns c2 ON c2.id=cc2.campaign_id
			                   WHERE c2.organization_id=$1 AND cc2.campaign_id <> $2::uuid), 0)`,
			a.OrgID, cid).Scan(&orgTotal, &allocElsewhere)
		if avail := orgTotal - allocElsewhere; *b.AllocatedCredits > avail {
			http.Error(w, fmt.Sprintf("allocation exceeds org credit pool: only %d of %d credits available (rest allocated to other campaigns)", avail, orgTotal), http.StatusBadRequest)
			return
		}
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

// usageRange resolves the ?from=&to= (YYYY-MM-DD, workspace-local) window for the
// usage endpoints, defaulting to the last 30 days. `to` is inclusive (we add a day
// in the query). Both are returned as date strings for the SQL casts.
func usageRange(r *http.Request) (from, to string) {
	to = r.URL.Query().Get("to")
	from = r.URL.Query().Get("from")
	if to == "" {
		to = time.Now().Format("2006-01-02")
	}
	if from == "" {
		from = time.Now().AddDate(0, 0, -30).Format("2006-01-02")
	}
	return from, to
}

// campaignUsageRows returns per-day, per-feature AI usage for one campaign, joined
// from the llm_usage ledger via conversations. Feature ∈ nurture/followup/extract/
// summary; nurture+followup are the credit-consuming customer replies. Catalog has
// no conversation so it never maps to a campaign here (it's a one-off setup cost).
func (s *server) campaignUsageRows(r *http.Request, orgID, cid, from, to string) ([]map[string]any, error) {
	return s.queryMaps(r.Context(),
		`SELECT to_char(date_trunc('day', lu.created_at), 'YYYY-MM-DD') AS day,
		        lu.feature,
		        count(*)::int AS count,
		        COALESCE(sum(lu.cost_usd), 0)::numeric(12,4) AS cost_usd
		   FROM llm_usage lu
		   JOIN conversations cv ON cv.id = lu.conversation_id
		  WHERE lu.organization_id = $1 AND cv.campaign_id = $2::uuid
		    AND lu.created_at >= $3::date AND lu.created_at < ($4::date + 1)
		  GROUP BY 1, 2 ORDER BY 1, 2`, orgID, cid, from, to)
}

// GET /api/campaigns/{id}/usage?from=&to= — daily per-feature AI usage for the chart.
func (s *server) handleCampaignUsage(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	cid := r.PathValue("id")
	from, to := usageRange(r)
	rows, err := s.campaignUsageRows(r, a.OrgID, cid, from, to)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"from": from, "to": to, "rows": rows})
}

// GET /api/campaigns/{id}/usage.csv?from=&to= — same data as a CSV download.
func (s *server) handleCampaignUsageCSV(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	cid := r.PathValue("id")
	from, to := usageRange(r)
	rows, err := s.campaignUsageRows(r, a.OrgID, cid, from, to)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition",
		fmt.Sprintf("attachment; filename=\"usage_%s_%s_to_%s.csv\"", cid[:8], from, to))
	cw := csv.NewWriter(w)
	_ = cw.Write([]string{"date", "feature", "count", "cost_usd"})
	for _, m := range rows {
		cw.Write([]string{
			fmt.Sprint(m["day"]), fmt.Sprint(m["feature"]),
			fmt.Sprint(m["count"]), fmt.Sprint(m["cost_usd"]),
		})
	}
	cw.Flush()
}

// GET /api/subscription/usage — the detail behind the one-line quota bar: AI
// replies per day (last 30) and the split per campaign this month. Deliberately
// computed from the SAME source as used_simpuler_credits (bot messages), so
// this page and the header can never disagree; the per-campaign allocation
// (campaign_credits) is joined alongside as its own columns, clearly separate.
func (s *server) handleSubscriptionUsage(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	// All time, per hari, PER FITUR (nurture/followup/extract/summary/dst) dari
	// ledger llm_usage — sumber yang sama dengan tab Credits & Usage per
	// campaign, jadi angkanya tidak pernah beda cerita. Zero-filled via
	// generate_series x daftar fitur supaya timeline kontinu.
	// HANYA fitur yang benar-benar memotong kredit (1 kredit = 1 balasan ke
	// customer): nurture + followup. extract/summary/ads_copy dst adalah biaya
	// internal, menampilkannya di sini membuat angka usage != angka kredit.
	daily, err := s.queryMaps(r.Context(),
		`SELECT to_char(d::date, 'YYYY-MM-DD') AS date, f.feature, COALESCE(x.count, 0) AS count
		   FROM generate_series(
		          (SELECT min(created_at)::date FROM llm_usage
		            WHERE organization_id=$1 AND feature IN ('nurture','followup')),
		          current_date, interval '1 day') d
		   CROSS JOIN (SELECT DISTINCT feature FROM llm_usage
		                WHERE organization_id=$1 AND feature IN ('nurture','followup')) f
		   LEFT JOIN (
		     SELECT created_at::date AS day, feature, count(*)::int AS count
		       FROM llm_usage WHERE organization_id=$1 AND feature IN ('nurture','followup')
		      GROUP BY 1, 2
		   ) x ON x.day = d::date AND x.feature = f.feature
		  ORDER BY 1, 2`, a.OrgID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	// One row per campaign with BOTH facts side by side: the credit ledger
	// (used/allocated/remaining — the billing truth, identical to each
	// campaign's Credits & Usage tab) and this month's AI replies (activity).
	byCampaign, err := s.queryMaps(r.Context(),
		`SELECT c.id::text AS campaign_id, c.name AS campaign,
		        COALESCE(cc.allocated_credits, 0) AS allocated_credits,
		        COALESCE(cc.used_credits, 0) AS used_credits,
		        COALESCE(cc.allocated_credits - cc.used_credits, 0) AS remaining,
		        COALESCE(mm.replies, 0) AS replies
		   FROM campaigns c
		   LEFT JOIN campaign_credits cc ON cc.campaign_id = c.id
		   LEFT JOIN LATERAL (
		     SELECT count(*)::int AS replies
		       FROM messages m JOIN conversations cv ON cv.id = m.conversation_id
		      WHERE m.organization_id=$1 AND m.sender_type='bot'
		        AND cv.campaign_id = c.id AND m.created_at >= date_trunc('month', now())
		   ) mm ON true
		  WHERE c.organization_id=$1
		  ORDER BY COALESCE(cc.used_credits,0) DESC, c.name`, a.OrgID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	// Total per fitur, all time — kartu ringkas di atas chart.
	byFeature, _ := s.queryMaps(r.Context(),
		`SELECT feature, count(*)::int AS count
		   FROM llm_usage WHERE organization_id=$1 AND feature IN ('nurture','followup')
		  GROUP BY 1 ORDER BY count(*) DESC`, a.OrgID)
	writeJSON(w, map[string]any{"daily": daily, "by_feature": byFeature, "by_campaign": byCampaign})
}
