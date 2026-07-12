package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"os"
	"github.com/google/uuid"
	"github.com/simpulx/v2/libs/go/config"
	"strings"
	"time"
)

// ── Ad performance reporting ─────────────────────────────────
// Pulls daily ad metrics (impressions/reach/clicks/results/spend) per ad-side
// campaign and lets the user map each to one of OUR campaigns, so spend can be
// joined to leads + conversions for cost-per-lead and cost-per-sale.
//
// Platform-agnostic: ad_accounts.platform selects the fetcher. Meta is live;
// TikTok and Google share the same tables and slot in as additional fetchers.

const metaGraphVersion = "v21.0"

var adHTTP = &http.Client{Timeout: 30 * time.Second}

// GET /api/ad-accounts
func (s *server) handleListAdAccounts(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	rows, err := s.queryMaps(r.Context(),
		`SELECT id::text AS id, platform, external_account_id, name, status, currency,
		        (access_token IS NOT NULL AND access_token <> '') AS has_token,
		        last_synced_at, last_error, created_at, updated_at,
		        (SELECT count(*) FROM ad_campaigns ac WHERE ac.ad_account_id = aa.id) AS campaign_count
		   FROM ad_accounts aa
		  WHERE organization_id = $1
		  ORDER BY created_at`,
		a.OrgID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

// POST /api/ad-accounts  — connect an ad account (manual token for now).
func (s *server) handleCreateAdAccount(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var b struct {
		Platform          string         `json:"platform"`
		ExternalAccountID string         `json:"external_account_id"`
		Name              string         `json:"name"`
		AccessToken       string         `json:"access_token"`
		Config            map[string]any `json:"config"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	b.Platform = strings.ToLower(strings.TrimSpace(b.Platform))
	b.ExternalAccountID = strings.TrimSpace(strings.TrimPrefix(b.ExternalAccountID, "act_"))
	if b.Platform == "" {
		b.Platform = "meta"
	}
	if b.Platform == "google" {
		// Google customer ids are digits only (strip dashes).
		b.ExternalAccountID = strings.Map(func(r rune) rune {
			if r >= '0' && r <= '9' {
				return r
			}
			return -1
		}, b.ExternalAccountID)
	}
	if b.ExternalAccountID == "" || b.AccessToken == "" {
		http.Error(w, "account id and access token are required", http.StatusBadRequest)
		return
	}
	if b.Config == nil {
		b.Config = map[string]any{}
	}
	cfg, _ := json.Marshal(b.Config)
	var id string
	err := s.pool.QueryRow(r.Context(),
		`INSERT INTO ad_accounts (organization_id, platform, external_account_id, name, access_token, config)
		 VALUES ($1,$2,$3,$4,$5,$6)
		 ON CONFLICT (organization_id, platform, external_account_id)
		 DO UPDATE SET access_token = EXCLUDED.access_token, name = COALESCE(NULLIF(EXCLUDED.name,''), ad_accounts.name),
		               config = EXCLUDED.config, status='connected', last_error=NULL
		 RETURNING id::text`,
		a.OrgID, b.Platform, b.ExternalAccountID, b.Name, b.AccessToken, cfg).Scan(&id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.audit(r.Context(), a, "connected", "ad_account", id, map[string]any{"platform": b.Platform, "account": b.ExternalAccountID})
	// Best-effort first sync so the dashboard isn't empty.
	if err := s.syncAccount(r.Context(), id, a.OrgID, b.Platform); err != nil {
		writeJSON(w, map[string]any{"id": id, "sync_error": err.Error()})
		return
	}
	writeJSON(w, map[string]any{"id": id})
}

// syncAccount dispatches to the right platform fetcher.
func (s *server) syncAccount(ctx context.Context, accountID, orgID, platform string) error {
	switch platform {
	case "meta":
		return s.syncMetaAccount(ctx, accountID, orgID)
	case "tiktok":
		return s.syncTikTokAccount(ctx, accountID, orgID)
	case "google":
		return s.syncGoogleAccount(ctx, accountID, orgID)
	default:
		return fmt.Errorf("%s sync is not supported", platform)
	}
}

// PATCH /api/ad-accounts/{id} — edit the connection (name, account id, access
// token). Supplying a new token clears the error state so the next sync re-validates.
func (s *server) handlePatchAdAccount(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	id := r.PathValue("id")
	var b struct {
		Name              *string `json:"name"`
		ExternalAccountID *string `json:"external_account_id"`
		AccessToken       *string `json:"access_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	extID := ""
	if b.ExternalAccountID != nil {
		extID = strings.TrimSpace(strings.TrimPrefix(*b.ExternalAccountID, "act_"))
	}
	tag, err := s.pool.Exec(r.Context(),
		`UPDATE ad_accounts SET
		   name = COALESCE(NULLIF($3,''), name),
		   external_account_id = COALESCE(NULLIF($4,''), external_account_id),
		   access_token = COALESCE(NULLIF($5,''), access_token),
		   status     = CASE WHEN NULLIF($5,'') IS NOT NULL THEN 'connected' ELSE status END,
		   last_error = CASE WHEN NULLIF($5,'') IS NOT NULL THEN NULL ELSE last_error END
		 WHERE id=$1 AND organization_id=$2`,
		id, a.OrgID, derefStr(b.Name), extID, derefStr(b.AccessToken))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	s.audit(r.Context(), a, "updated", "ad_account", id, nil)
	writeJSON(w, map[string]any{"status": "updated"})
}

// DELETE /api/ad-accounts/{id}
func (s *server) handleDeleteAdAccount(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	id := r.PathValue("id")
	tag, err := s.pool.Exec(r.Context(),
		`DELETE FROM ad_accounts WHERE id = $1 AND organization_id = $2`, id, a.OrgID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	s.audit(r.Context(), a, "disconnected", "ad_account", id, nil)
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/ad-accounts/{id}/sync — pull the latest metrics now.
func (s *server) handleSyncAdAccount(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	id := r.PathValue("id")
	var platform string
	if err := s.pool.QueryRow(r.Context(),
		`SELECT platform FROM ad_accounts WHERE id=$1 AND organization_id=$2`, id, a.OrgID).Scan(&platform); err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if err := s.syncAccount(r.Context(), id, a.OrgID, platform); err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	writeJSON(w, map[string]any{"ok": true})
}

// GET /api/ad-campaigns — discovered ad campaigns + their mapping.
func (s *server) handleListAdCampaigns(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	rows, err := s.queryMaps(r.Context(),
		`SELECT ac.id::text AS id, ac.platform, ac.external_id, ac.name,
		        ac.campaign_id::text AS campaign_id, c.name AS campaign_name,
		        aa.name AS account_name, ac.ad_account_id::text AS ad_account_id,
		        COALESCE((SELECT array_agg(m.campaign_id::text ORDER BY cc.name)
		                    FROM ad_campaign_campaigns m JOIN campaigns cc ON cc.id = m.campaign_id
		                   WHERE m.ad_campaign_id = ac.id), '{}') AS campaign_ids,
		        COALESCE((SELECT string_agg(cc.name, ', ' ORDER BY cc.name)
		                    FROM ad_campaign_campaigns m JOIN campaigns cc ON cc.id = m.campaign_id
		                   WHERE m.ad_campaign_id = ac.id), '') AS campaign_names,
		        COALESCE((SELECT sum(spend) FROM ad_metrics m WHERE m.ad_campaign_id = ac.id),0)::float8 AS spend,
		        COALESCE((SELECT sum(impressions) FROM ad_metrics m WHERE m.ad_campaign_id = ac.id),0)::bigint AS impressions
		   FROM ad_campaigns ac
		   JOIN ad_accounts aa ON aa.id = ac.ad_account_id
		   LEFT JOIN campaigns c ON c.id = ac.campaign_id
		  WHERE ac.organization_id = $1
		  ORDER BY spend DESC, ac.name`,
		a.OrgID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

// PATCH /api/ad-campaigns/{id} — map an ad campaign to one or more of OUR
// campaigns. Accepts `campaign_ids` (the new many-to-many form) or a single
// legacy `campaign_id`. The join table is the source of truth; the legacy
// ad_campaigns.campaign_id column is kept in sync with the first mapping.
func (s *server) handlePatchAdCampaign(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	id := r.PathValue("id")
	var b struct {
		CampaignIDs []string `json:"campaign_ids"`
		CampaignID  *string  `json:"campaign_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	// Normalize to a de-duplicated, non-empty id list.
	ids := b.CampaignIDs
	if ids == nil && b.CampaignID != nil {
		if c := strings.TrimSpace(*b.CampaignID); c != "" {
			ids = []string{c}
		}
	}
	seen := map[string]bool{}
	clean := ids[:0]
	for _, c := range ids {
		if c = strings.TrimSpace(c); c != "" && !seen[c] {
			seen[c] = true
			clean = append(clean, c)
		}
	}

	tx, err := s.pool.Begin(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	// Ownership check (also gives us "not found" for a foreign id).
	var owned bool
	if err := tx.QueryRow(r.Context(),
		`SELECT true FROM ad_campaigns WHERE id=$1 AND organization_id=$2`, id, a.OrgID).Scan(&owned); err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if _, err := tx.Exec(r.Context(), `DELETE FROM ad_campaign_campaigns WHERE ad_campaign_id=$1`, id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	for _, cid := range clean {
		if _, err := tx.Exec(r.Context(),
			`INSERT INTO ad_campaign_campaigns (ad_campaign_id, campaign_id, organization_id)
			 VALUES ($1, $2::uuid, $3) ON CONFLICT DO NOTHING`, id, cid, a.OrgID); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}
	first := ""
	if len(clean) > 0 {
		first = clean[0]
	}
	if _, err := tx.Exec(r.Context(),
		`UPDATE ad_campaigns SET campaign_id = NULLIF($3,'')::uuid WHERE id=$1 AND organization_id=$2`,
		id, a.OrgID, first); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"ok": true})
}

// GET /api/ad-performance?from=&to=&campaign_id=
// Returns per-(our)-campaign rollup (spend + leads + sales -> CPL/CPS) plus a
// daily breakdown and totals.
func (s *server) handleAdPerformance(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	to := r.URL.Query().Get("to")
	from := r.URL.Query().Get("from")
	if to == "" {
		to = time.Now().Format("2006-01-02")
	}
	if from == "" {
		from = "2000-01-01" // empty range = all time
	}
	// campaign_id / account_id may be comma-separated lists (multi-select). Empty = all.
	campIDs := []string{}
	for _, c := range strings.Split(r.URL.Query().Get("campaign_id"), ",") {
		if c = strings.TrimSpace(c); c != "" {
			campIDs = append(campIDs, c)
		}
	}
	accountIDs := []string{}
	for _, c := range strings.Split(r.URL.Query().Get("account_id"), ",") {
		if c = strings.TrimSpace(c); c != "" {
			accountIDs = append(accountIDs, c)
		}
	}
	// platform (ad source) filter — meta | google | tiktok. A single OUR campaign
	// can aggregate several sources, so this slices spend by source. Empty = all.
	platforms := []string{}
	hasMeta := true
	for _, p := range strings.Split(r.URL.Query().Get("platform"), ",") {
		if p = strings.TrimSpace(strings.ToLower(p)); p != "" {
			platforms = append(platforms, p)
		}
	}
	if len(platforms) > 0 {
		hasMeta = false
		for _, p := range platforms {
			if p == "meta" {
				hasMeta = true
			}
		}
	}

	// Role scope: admin/owner see every campaign; manager/agent are limited to the
	// campaigns they're assigned to (campaign_agents), intersected with any filter.
	// Applied by narrowing campIDs, which every query below already respects.
	if a.Role != "admin" && a.Role != "owner" {
		mineRows, _ := s.queryMaps(r.Context(), `SELECT campaign_id::text AS id FROM campaign_agents WHERE user_id=$1`, a.UserID)
		mine := map[string]bool{}
		for _, mr := range mineRows {
			if id, ok := mr["id"].(string); ok && id != "" {
				mine[id] = true
			}
		}
		if len(campIDs) == 0 {
			for id := range mine {
				campIDs = append(campIDs, id)
			}
		} else {
			kept := campIDs[:0]
			for _, c := range campIDs {
				if mine[c] {
					kept = append(kept, c)
				}
			}
			campIDs = kept
		}
		// A scoped user with no campaigns must see nothing, not everything.
		if len(campIDs) == 0 {
			campIDs = []string{"00000000-0000-0000-0000-000000000000"}
		}
	}

	// Per-campaign: ad spend joined to OUR leads + sales (sale = reached the final
	// stage). Spend is joined through ad_campaign_campaigns, so an ad campaign
	// mapped to several campaigns shows its full spend under each (Option A).
	campRows, err := s.queryMaps(r.Context(),
		`SELECT c.id::text AS campaign_id, c.name AS campaign_name,
		        COALESCE(m.spend,0)::float8 AS spend, COALESCE(m.impressions,0)::bigint AS impressions,
		        COALESCE(m.reach,0)::bigint AS reach, COALESCE(m.clicks,0)::bigint AS clicks, COALESCE(m.results,0)::bigint AS results,
		        COALESCE(l.leads,0) AS leads, COALESCE(l.sales,0) AS sales
		   FROM campaigns c
		   LEFT JOIN (
		     SELECT map.campaign_id,
		            sum(am.spend) spend, sum(am.impressions) impressions, sum(am.reach) reach,
		            sum(am.clicks) clicks, sum(am.results) results
		       FROM ad_metrics am
		       JOIN ad_campaigns ac ON ac.id = am.ad_campaign_id
		       JOIN ad_campaign_campaigns map ON map.ad_campaign_id = ac.id
		      WHERE am.organization_id = $1 AND am.date BETWEEN $2 AND $3
		        AND (cardinality($4::text[]) = 0 OR ac.platform = ANY($4::text[]))
		        AND (cardinality($5::text[]) = 0 OR ac.ad_account_id::text = ANY($5::text[]))
		      GROUP BY map.campaign_id
		   ) m ON m.campaign_id = c.id
		   LEFT JOIN (
		     SELECT cv.campaign_id,
		            count(*) leads,
		            count(*) FILTER (WHERE st.sort_order = (SELECT max(sort_order) FROM stages WHERE organization_id=$1)) sales
		       FROM conversations cv LEFT JOIN stages st ON st.id = cv.stage_id
		      WHERE cv.organization_id = $1 AND cv.created_at::date BETWEEN $2 AND $3 AND cv.campaign_id IS NOT NULL
		      GROUP BY cv.campaign_id
		   ) l ON l.campaign_id = c.id
		  WHERE c.organization_id = $1
		    AND (cardinality($6::uuid[]) = 0 OR c.id = ANY($6::uuid[]))
		    AND (m.campaign_id IS NOT NULL OR l.leads > 0)
		  ORDER BY spend DESC, leads DESC, c.name`,
		a.OrgID, from, to, platforms, accountIDs, campIDs)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Daily breakdown (the "Daily Performance" table), optionally one campaign.
	dq := `SELECT am.date,
	              sum(am.impressions)::bigint impressions, sum(am.reach)::bigint reach, sum(am.clicks)::bigint clicks,
	              sum(am.results)::bigint results, sum(am.spend)::float8 spend
	         FROM ad_metrics am JOIN ad_campaigns ac ON ac.id = am.ad_campaign_id
	        WHERE am.organization_id = $1 AND am.date BETWEEN $2 AND $3`
	args := []any{a.OrgID, from, to}
	if len(campIDs) > 0 {
		args = append(args, campIDs)
		dq += fmt.Sprintf(" AND ac.id IN (SELECT ad_campaign_id FROM ad_campaign_campaigns WHERE campaign_id = ANY($%d::uuid[]))", len(args))
	}
	if len(platforms) > 0 {
		args = append(args, platforms)
		dq += fmt.Sprintf(" AND ac.platform = ANY($%d::text[])", len(args))
	}
	if len(accountIDs) > 0 {
		args = append(args, accountIDs)
		dq += fmt.Sprintf(" AND ac.ad_account_id::text = ANY($%d::text[])", len(args))
	}
	dq += " GROUP BY am.date ORDER BY am.date DESC"
	dailyRows, err := s.queryMaps(r.Context(), dq, args...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Daily leads (chats) attributed to a campaign — the real conversion signal
	// (Meta "results" is often 0 for click/reach-optimised ads). Merged into the
	// daily rows so the Timeline can show leads instead of Meta results. Leads are
	// WhatsApp conversations (source-agnostic), so only the campaign filter applies.
	lq := `SELECT cv.created_at::date AS d, count(*)::bigint AS leads,
	              count(*) FILTER (WHERE st.sort_order = (SELECT max(sort_order) FROM stages WHERE organization_id=$1))::bigint AS sales
	         FROM conversations cv LEFT JOIN stages st ON st.id = cv.stage_id
	        WHERE cv.organization_id=$1 AND cv.created_at::date BETWEEN $2 AND $3 AND cv.campaign_id IS NOT NULL`
	largs := []any{a.OrgID, from, to}
	if len(campIDs) > 0 {
		largs = append(largs, campIDs)
		lq += fmt.Sprintf(" AND cv.campaign_id = ANY($%d::uuid[])", len(largs))
	}
	lq += " GROUP BY 1"
	leadRows, _ := s.queryMaps(r.Context(), lq, largs...)
	leadsByDate := map[string]int64{}
	salesByDate := map[string]int64{}
	for _, lr := range leadRows {
		if d, ok := lr["d"].(time.Time); ok {
			day := d.Format("2006-01-02")
			if n, ok := lr["leads"].(int64); ok {
				leadsByDate[day] = n
			}
			if n, ok := lr["sales"].(int64); ok {
				salesByDate[day] = n
			}
		}
	}
	for _, dr := range dailyRows {
		if d, ok := dr["date"].(time.Time); ok {
			day := d.Format("2006-01-02")
			dr["leads"] = leadsByDate[day]
			dr["sales"] = salesByDate[day]
		} else {
			dr["leads"] = int64(0)
			dr["sales"] = int64(0)
		}
	}

	// Latest leads with a classified source -> the Latest Leads table
	// (Date | Name | Phone | Channel | Source | Stage).
	rlq := `SELECT cv.id::text AS conversation_id, cv.created_at, ct.full_name AS contact_name, ct.phone AS contact_phone, ct.email AS contact_email, cv.channel, cv.interest_level, ` + sourceClassifyExpr("cv") + ` AS source, st.name AS stage
	          FROM conversations cv
	          LEFT JOIN contacts ct ON ct.id = cv.contact_id
	          LEFT JOIN stages st ON st.id = cv.stage_id
	         WHERE cv.organization_id=$1 AND cv.created_at::date BETWEEN $2 AND $3 AND cv.campaign_id IS NOT NULL`
	rlargs := []any{a.OrgID, from, to}
	if len(campIDs) > 0 {
		rlargs = append(rlargs, campIDs)
		rlq += fmt.Sprintf(" AND cv.campaign_id = ANY($%d::uuid[])", len(rlargs))
	}
	rlq += " ORDER BY cv.created_at DESC LIMIT 10"
	recentLeads, rlErr := s.queryMaps(r.Context(), rlq, rlargs...)
	if rlErr != nil {
		s.log.Warn("ads recent_leads query failed", "err", rlErr)
	}

	// Per ad/creative: leads + conversions grouped by the click-to-WhatsApp ad id
	// (conversation_attributions.referral_source). Spend stays campaign-level (Meta
	// only syncs campaign insights), so this view is leads -> conversions only.
	cq := `SELECT att.referral_source AS source_id,
	              max(att.referral_url) AS source_url,
	              COALESCE((array_agg(att.referral_image_url) FILTER (WHERE att.referral_image_url IS NOT NULL))[1], max(acr.image_url)) AS image_url,
	              -- Prefer the synced Marketing-API creative title: the CTWA referral
	              -- headline is usually the button/greeting text ("Chat with us"),
	              -- not the ad's real headline.
	              COALESCE(NULLIF(max(acr.title), ''),
	                       (array_agg(att.referral_headline) FILTER (WHERE att.referral_headline IS NOT NULL
	                          AND att.referral_headline NOT IN ('Chat with us', 'Chat on WhatsApp')))[1]) AS headline,
	              COALESCE((array_agg(att.referral_body)      FILTER (WHERE att.referral_body      IS NOT NULL))[1], max(acr.body)) AS body,
	              COALESCE(max(sp.spend), 0) AS spend,
	              COALESCE(max(sp.impressions), 0) AS impressions,
	              COALESCE(max(sp.clicks), 0) AS clicks,
	              count(DISTINCT cv.id) AS leads,
	              count(DISTINCT cv.id) FILTER (
	                WHERE st.sort_order = (SELECT max(sort_order) FROM stages WHERE organization_id = $1)
	              ) AS sales
	         FROM conversation_attributions att
	         JOIN conversations cv ON cv.id = att.conversation_id
	         LEFT JOIN stages st ON st.id = cv.stage_id
	         LEFT JOIN ad_creatives acr ON acr.organization_id = $1 AND acr.ad_external_id = att.referral_source
	         LEFT JOIN (
	              SELECT ad_external_id, sum(spend) AS spend, sum(impressions) AS impressions, sum(clicks) AS clicks
	                FROM ad_ad_metrics
	               WHERE organization_id = $1 AND date BETWEEN $2 AND $3
	               GROUP BY ad_external_id
	         ) sp ON sp.ad_external_id = att.referral_source
	        WHERE att.organization_id = $1
	          AND att.referral_source IS NOT NULL AND att.referral_source <> ''
	          AND cv.created_at::date BETWEEN $2 AND $3`
	cargs := []any{a.OrgID, from, to}
	if len(campIDs) > 0 {
		cargs = append(cargs, campIDs)
		cq += fmt.Sprintf(" AND cv.campaign_id = ANY($%d::uuid[])", len(cargs))
	}
	cq += " GROUP BY att.referral_source ORDER BY leads DESC, sales DESC LIMIT 100"
	// Per-creative rows are click-to-WhatsApp (Meta) by nature, so when the source
	// filter is set to non-Meta platforms only, there are no creatives to show.
	creativeRows := []map[string]any{}
	if hasMeta {
		creativeRows, err = s.queryMaps(r.Context(), cq, cargs...)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}

	// Demographic breakdowns (account-level snapshot from the last sync; not
	// date-filtered). Split into age / gender for the two donut charts.
	bdRows, _ := s.queryMaps(r.Context(),
		`SELECT dimension, value, impressions, reach, clicks, results, spend
		   FROM ad_breakdowns WHERE organization_id=$1
		  ORDER BY dimension, impressions DESC`, a.OrgID)
	age := []map[string]any{}
	gender := []map[string]any{}
	region := []map[string]any{}
	for _, b := range bdRows {
		switch b["dimension"] {
		case "age":
			age = append(age, b)
		case "gender":
			gender = append(gender, b)
		case "region":
			region = append(region, b)
		}
	}

	// Per-source performance table (Looker-style): ad impressions/clicks/spend by
	// platform (meta|google|tiktok) merged with leads by the lead-source classifier
	// (adds website/direct). Ignores the source filter so it stays a full breakdown
	// you can cross-filter from; respects the date/campaign/account scope.
	platArgs := []any{a.OrgID, from, to}
	platQ := `SELECT ac.platform, sum(am.impressions)::bigint AS impressions, sum(am.clicks)::bigint AS clicks, sum(am.spend)::float8 AS spend
	            FROM ad_metrics am JOIN ad_campaigns ac ON ac.id = am.ad_campaign_id
	           WHERE am.organization_id=$1 AND am.date BETWEEN $2 AND $3`
	if len(campIDs) > 0 {
		platArgs = append(platArgs, campIDs)
		platQ += fmt.Sprintf(" AND ac.id IN (SELECT ad_campaign_id FROM ad_campaign_campaigns WHERE campaign_id = ANY($%d::uuid[]))", len(platArgs))
	}
	if len(accountIDs) > 0 {
		platArgs = append(platArgs, accountIDs)
		platQ += fmt.Sprintf(" AND ac.ad_account_id::text = ANY($%d::text[])", len(platArgs))
	}
	platQ += " GROUP BY ac.platform"
	platRows, _ := s.queryMaps(r.Context(), platQ, platArgs...)

	srcArgs := []any{a.OrgID, from, to}
	srcQ := `SELECT ` + sourceClassifyExpr("cv") + ` AS source, count(*)::bigint AS leads,
	                count(*) FILTER (WHERE d.category='won')::bigint AS purchases
	           FROM conversations cv
	           LEFT JOIN dispositions d ON d.id = cv.disposition_id
	          WHERE cv.organization_id=$1 AND cv.created_at::date BETWEEN $2 AND $3 AND cv.campaign_id IS NOT NULL`
	if len(campIDs) > 0 {
		srcArgs = append(srcArgs, campIDs)
		srcQ += fmt.Sprintf(" AND cv.campaign_id = ANY($%d::uuid[])", len(srcArgs))
	}
	srcQ += " GROUP BY 1"
	srcRows, _ := s.queryMaps(r.Context(), srcQ, srcArgs...)

	type srcAgg struct {
		impressions, clicks, leads, purchases int64
		spend                                 float64
	}
	gi := func(v any) int64 {
		if n, ok := v.(int64); ok {
			return n
		}
		return 0
	}
	gf := func(v any) float64 {
		if f, ok := v.(float64); ok {
			return f
		}
		return 0
	}
	byKey := map[string]*srcAgg{}
	platToKey := map[string]string{"meta": "meta_ads", "tiktok": "tiktok_ads", "google": "google_ads"}
	for _, pr := range platRows {
		key := platToKey[fmt.Sprint(pr["platform"])]
		if key == "" {
			continue
		}
		agg := byKey[key]
		if agg == nil {
			agg = &srcAgg{}
			byKey[key] = agg
		}
		agg.impressions += gi(pr["impressions"])
		agg.clicks += gi(pr["clicks"])
		agg.spend += gf(pr["spend"])
	}
	for _, sr := range srcRows {
		key := fmt.Sprint(sr["source"])
		agg := byKey[key]
		if agg == nil {
			agg = &srcAgg{}
			byKey[key] = agg
		}
		agg.leads += gi(sr["leads"])
		agg.purchases += gi(sr["purchases"])
	}
	srcOrder := []string{"meta_ads", "tiktok_ads", "google_ads", "website", "direct"}
	srcLabels := map[string]string{"meta_ads": "Meta Ads", "tiktok_ads": "TikTok Ads", "google_ads": "Google Ads", "website": "Website", "direct": "Direct"}
	sources := []map[string]any{}
	for _, k := range srcOrder {
		agg := byKey[k]
		if agg == nil {
			continue
		}
		ctr, cvr := 0.0, 0.0
		if agg.impressions > 0 {
			ctr = float64(agg.clicks) / float64(agg.impressions) * 100
		}
		if agg.clicks > 0 {
			cvr = float64(agg.leads) / float64(agg.clicks) * 100
		}
		sources = append(sources, map[string]any{
			"source": k, "label": srcLabels[k],
			"impressions": agg.impressions, "clicks": agg.clicks, "spend": agg.spend,
			"leads": agg.leads, "purchases": agg.purchases, "ctr": ctr, "cvr": cvr,
		})
	}

	// Per-source daily series: ad delivery (impressions/clicks/spend) by platform
	// merged with leads by the source classifier, keyed on (source, day). Powers
	// the in-cell sparklines in the Source performance table and the per-source
	// leads area chart. Same date/campaign/account scope as the aggregate views.
	type dsAgg struct {
		impressions, clicks, leads int64
		spend                      float64
	}
	dsByKey := map[string]map[string]*dsAgg{}
	dsTouch := func(src, day string) *dsAgg {
		m := dsByKey[src]
		if m == nil {
			m = map[string]*dsAgg{}
			dsByKey[src] = m
		}
		ag := m[day]
		if ag == nil {
			ag = &dsAgg{}
			m[day] = ag
		}
		return ag
	}
	// (a) ad delivery per platform per day -> source key.
	ddArgs := []any{a.OrgID, from, to}
	ddQ := `SELECT am.date, ac.platform,
	               sum(am.impressions)::bigint impressions, sum(am.clicks)::bigint clicks, sum(am.spend)::float8 spend
	          FROM ad_metrics am JOIN ad_campaigns ac ON ac.id = am.ad_campaign_id
	         WHERE am.organization_id=$1 AND am.date BETWEEN $2 AND $3`
	if len(campIDs) > 0 {
		ddArgs = append(ddArgs, campIDs)
		ddQ += fmt.Sprintf(" AND ac.id IN (SELECT ad_campaign_id FROM ad_campaign_campaigns WHERE campaign_id = ANY($%d::uuid[]))", len(ddArgs))
	}
	if len(platforms) > 0 {
		ddArgs = append(ddArgs, platforms)
		ddQ += fmt.Sprintf(" AND ac.platform = ANY($%d::text[])", len(ddArgs))
	}
	if len(accountIDs) > 0 {
		ddArgs = append(ddArgs, accountIDs)
		ddQ += fmt.Sprintf(" AND ac.ad_account_id::text = ANY($%d::text[])", len(ddArgs))
	}
	ddQ += " GROUP BY am.date, ac.platform"
	ddRows, _ := s.queryMaps(r.Context(), ddQ, ddArgs...)
	for _, dr := range ddRows {
		day, _ := dr["date"].(time.Time)
		key := platToKey[fmt.Sprint(dr["platform"])]
		if key == "" || day.IsZero() {
			continue
		}
		ag := dsTouch(key, day.Format("2006-01-02"))
		ag.impressions += gi(dr["impressions"])
		ag.clicks += gi(dr["clicks"])
		ag.spend += gf(dr["spend"])
	}
	// (b) leads per source per day (classifier).
	dsq := `SELECT created_at::date AS date, ` + sourceClassifyExpr("") + ` AS source, count(*)::bigint AS leads
	          FROM conversations
	         WHERE organization_id=$1 AND created_at::date BETWEEN $2 AND $3 AND campaign_id IS NOT NULL`
	dsargs := []any{a.OrgID, from, to}
	if len(campIDs) > 0 {
		dsargs = append(dsargs, campIDs)
		dsq += fmt.Sprintf(" AND campaign_id = ANY($%d::uuid[])", len(dsargs))
	}
	dsq += " GROUP BY 1, 2"
	dsLeadRows, _ := s.queryMaps(r.Context(), dsq, dsargs...)
	for _, dr := range dsLeadRows {
		day, _ := dr["date"].(time.Time)
		src := fmt.Sprint(dr["source"])
		if day.IsZero() || src == "" {
			continue
		}
		dsTouch(src, day.Format("2006-01-02")).leads += gi(dr["leads"])
	}
	dailySources := []map[string]any{}
	for src, byDay := range dsByKey {
		for day, ag := range byDay {
			dailySources = append(dailySources, map[string]any{
				"date": day, "source": src,
				"impressions": ag.impressions, "clicks": ag.clicks, "spend": ag.spend, "leads": ag.leads,
			})
		}
	}
	sort.Slice(dailySources, func(i, j int) bool {
		di, dj := dailySources[i]["date"].(string), dailySources[j]["date"].(string)
		if di != dj {
			return di < dj
		}
		return dailySources[i]["source"].(string) < dailySources[j]["source"].(string)
	})

	writeJSON(w, map[string]any{
		"from": from, "to": to,
		"campaigns": campRows,
		"daily":         dailyRows,
		"creatives":     creativeRows,
		"sources":       sources,
		"daily_sources": dailySources,
		"recent_leads":  recentLeads,
		"age":           age,
		"gender":        gender,
		"region":        region,
	})
}

// ── Meta Marketing API fetcher ───────────────────────────────

type metaInsight struct {
	CampaignID   string `json:"campaign_id"`
	CampaignName string `json:"campaign_name"`
	AdID         string `json:"ad_id"`   // present on level=ad rows
	AdName       string `json:"ad_name"` // present on level=ad rows
	Impressions  string `json:"impressions"`
	Reach        string `json:"reach"`
	Clicks       string `json:"clicks"`
	Spend        string `json:"spend"`
	DateStart    string `json:"date_start"`
	Age          string `json:"age"`    // present on age-breakdown rows
	Gender       string `json:"gender"` // present on gender-breakdown rows
	Region       string `json:"region"` // present on region-breakdown rows (province/state)
	Actions      []struct {
		ActionType string `json:"action_type"`
		Value      string `json:"value"`
	} `json:"actions"`
}

// syncMetaAccount pulls the last 90 days of campaign-level daily insights and
// upserts ad_campaigns + ad_metrics.
func (s *server) syncMetaAccount(ctx context.Context, accountID, orgID string) error {
	var extID, token, currency, name string
	if err := s.pool.QueryRow(ctx,
		`SELECT external_account_id, COALESCE(access_token,''), COALESCE(currency,''), COALESCE(name,'')
		   FROM ad_accounts WHERE id=$1 AND organization_id=$2`, accountID, orgID).
		Scan(&extID, &token, &currency, &name); err != nil {
		return err
	}
	if token == "" {
		return fmt.Errorf("no access token on file")
	}

	// Account name + currency (best-effort).
	if cur, nm, err := metaAccountInfo(ctx, extID, token); err == nil {
		currency, name = cur, nm
		_, _ = s.pool.Exec(ctx, `UPDATE ad_accounts SET currency=NULLIF($2,''), name=COALESCE(NULLIF($3,''),name), updated_at=now() WHERE id=$1`, accountID, currency, name)
	}

	until := time.Now().Format("2006-01-02")
	since := time.Now().AddDate(0, 0, -90).Format("2006-01-02")
	tr, _ := json.Marshal(map[string]string{"since": since, "until": until})
	q := url.Values{}
	q.Set("level", "campaign")
	q.Set("time_increment", "1")
	q.Set("fields", "campaign_id,campaign_name,impressions,reach,clicks,spend,actions")
	q.Set("time_range", string(tr))
	q.Set("limit", "500")
	q.Set("access_token", token)
	next := fmt.Sprintf("https://graph.facebook.com/%s/act_%s/insights?%s", metaGraphVersion, extID, q.Encode())

	pages := 0
	for next != "" && pages < 25 {
		pages++
		var payload struct {
			Data   []metaInsight `json:"data"`
			Paging struct {
				Next string `json:"next"`
			} `json:"paging"`
			Error *struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if err := metaGet(ctx, next, &payload); err != nil {
			s.markAdAccountError(ctx, accountID, err.Error())
			return err
		}
		if payload.Error != nil {
			s.markAdAccountError(ctx, accountID, payload.Error.Message)
			return fmt.Errorf("meta: %s", payload.Error.Message)
		}
		for _, in := range payload.Data {
			acID, err := s.upsertAdCampaign(ctx, orgID, accountID, in.CampaignID, in.CampaignName)
			if err != nil {
				continue
			}
			s.upsertAdMetric(ctx, orgID, accountID, acID, in, currency)
		}
		next = payload.Paging.Next
	}

	// Ad-level (per creative) daily insights — powers the "Per ad / creative"
	// table's Spend / Cost-per-lead columns. Best-effort (never fails the sync).
	s.syncMetaAds(ctx, accountID, orgID, extID, token, currency)

	// Ad creative previews (thumbnail + copy), keyed by ad_id — so the creative
	// column shows an image even for historical CTWA leads. Best-effort.
	s.syncMetaAdCreatives(ctx, accountID, orgID, extID, token)

	// Demographic breakdowns (age + gender) — account-level snapshot over the
	// same window, best-effort (never fails the sync).
	s.syncMetaBreakdowns(ctx, accountID, orgID, extID, token)

	_, _ = s.pool.Exec(ctx, `UPDATE ad_accounts SET last_synced_at=now(), status='connected', last_error=NULL WHERE id=$1`, accountID)
	return nil
}

// syncMetaBreakdowns pulls account-level age + gender insights (aggregated over
// the last 90 days) and refreshes the ad_breakdowns snapshot.
func (s *server) syncMetaBreakdowns(ctx context.Context, accountID, orgID, extID, token string) {
	since := time.Now().AddDate(0, 0, -90).Format("2006-01-02")
	until := time.Now().Format("2006-01-02")
	tr, _ := json.Marshal(map[string]string{"since": since, "until": until})
	for _, dim := range []string{"age", "gender", "region"} {
		q := url.Values{}
		q.Set("level", "account")
		q.Set("fields", "impressions,reach,clicks,spend,actions")
		q.Set("breakdowns", dim)
		q.Set("time_range", string(tr))
		q.Set("limit", "500")
		q.Set("access_token", token)
		u := fmt.Sprintf("https://graph.facebook.com/%s/act_%s/insights?%s", metaGraphVersion, extID, q.Encode())
		var payload struct {
			Data  []metaInsight `json:"data"`
			Error *struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if err := metaGet(ctx, u, &payload); err != nil || payload.Error != nil {
			continue
		}
		// Refresh the snapshot for this dimension.
		_, _ = s.pool.Exec(ctx, `DELETE FROM ad_breakdowns WHERE ad_account_id=$1 AND dimension=$2`, accountID, dim)
		for _, in := range payload.Data {
			val := in.Age
			switch dim {
			case "gender":
				val = in.Gender
			case "region":
				val = in.Region
			}
			if strings.TrimSpace(val) == "" {
				val = "unknown"
			}
			_, _ = s.pool.Exec(ctx,
				`INSERT INTO ad_breakdowns (organization_id, ad_account_id, dimension, value, impressions, reach, clicks, results, spend)
				 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
				 ON CONFLICT (ad_account_id, dimension, value)
				 DO UPDATE SET impressions=EXCLUDED.impressions, reach=EXCLUDED.reach, clicks=EXCLUDED.clicks,
				               results=EXCLUDED.results, spend=EXCLUDED.spend, synced_at=now()`,
				orgID, accountID, dim, val,
				atoiSafe(in.Impressions), atoiSafe(in.Reach), atoiSafe(in.Clicks), metaResults(in), atofSafe(in.Spend))
		}
	}
}

// syncMetaAds pulls the last 90 days of ad-level daily insights (keyed by Meta
// ad_id, which equals the CTWA referral source_id) and upserts ad_ad_metrics, so
// the "Per ad / creative" table can show real Spend / Cost-per-lead.
func (s *server) syncMetaAds(ctx context.Context, accountID, orgID, extID, token, currency string) {
	until := time.Now().Format("2006-01-02")
	since := time.Now().AddDate(0, 0, -90).Format("2006-01-02")
	tr, _ := json.Marshal(map[string]string{"since": since, "until": until})
	q := url.Values{}
	q.Set("level", "ad")
	q.Set("time_increment", "1")
	q.Set("fields", "ad_id,ad_name,impressions,reach,clicks,spend")
	q.Set("time_range", string(tr))
	q.Set("limit", "500")
	q.Set("access_token", token)
	next := fmt.Sprintf("https://graph.facebook.com/%s/act_%s/insights?%s", metaGraphVersion, extID, q.Encode())

	pages := 0
	for next != "" && pages < 40 {
		pages++
		var payload struct {
			Data   []metaInsight `json:"data"`
			Paging struct {
				Next string `json:"next"`
			} `json:"paging"`
			Error *struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if err := metaGet(ctx, next, &payload); err != nil || payload.Error != nil {
			return // best-effort: leave any previously-synced rows in place
		}
		for _, in := range payload.Data {
			if in.AdID == "" {
				continue
			}
			s.upsertAdAdMetric(ctx, orgID, accountID, in, currency)
		}
		next = payload.Paging.Next
	}
}

func (s *server) upsertAdAdMetric(ctx context.Context, orgID, accountID string, in metaInsight, currency string) {
	_, _ = s.pool.Exec(ctx,
		`INSERT INTO ad_ad_metrics (organization_id, ad_account_id, ad_external_id, ad_name, date, impressions, reach, clicks, spend, currency)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULLIF($10,''))
		 ON CONFLICT (organization_id, ad_external_id, date)
		 DO UPDATE SET ad_name=EXCLUDED.ad_name, impressions=EXCLUDED.impressions, reach=EXCLUDED.reach,
		               clicks=EXCLUDED.clicks, spend=EXCLUDED.spend, currency=EXCLUDED.currency`,
		orgID, accountID, in.AdID, in.AdName, in.DateStart,
		atoiSafe(in.Impressions), atoiSafe(in.Reach), atoiSafe(in.Clicks), atofSafe(in.Spend), currency)
}

// metaAd is one row from GET /act_{id}/ads?fields=id,creative{...}.
type metaAd struct {
	ID       string `json:"id"`
	Creative struct {
		ThumbnailURL string `json:"thumbnail_url"`
		ImageURL     string `json:"image_url"`
		Title        string `json:"title"`
		Body         string `json:"body"`
		ObjectStory  struct {
			LinkData struct {
				Message string `json:"message"`
				Name    string `json:"name"`
				Picture string `json:"picture"`
			} `json:"link_data"`
			VideoData struct {
				ImageURL string `json:"image_url"`
				Message  string `json:"message"`
				Title    string `json:"title"`
			} `json:"video_data"`
		} `json:"object_story_spec"`
		// Dynamic/CTWA ads keep their texts here instead of object_story_spec.
		AssetFeed struct {
			Titles []struct {
				Text string `json:"text"`
			} `json:"titles"`
			Bodies []struct {
				Text string `json:"text"`
			} `json:"bodies"`
		} `json:"asset_feed_spec"`
	} `json:"creative"`
}

// syncMetaAdCreatives pulls the account's ads with their creative preview and
// upserts ad_creatives (keyed by ad_id). One paginated call per account.
func (s *server) syncMetaAdCreatives(ctx context.Context, accountID, orgID, extID, token string) {
	q := url.Values{}
	q.Set("fields", "id,creative{thumbnail_url,image_url,title,body,object_story_spec{link_data{message,name,picture},video_data{image_url,message,title}},asset_feed_spec{titles,bodies}}")
	q.Set("limit", "200")
	q.Set("access_token", token)
	next := fmt.Sprintf("https://graph.facebook.com/%s/act_%s/ads?%s", metaGraphVersion, extID, q.Encode())
	pages := 0
	for next != "" && pages < 40 {
		pages++
		var payload struct {
			Data   []metaAd `json:"data"`
			Paging struct {
				Next string `json:"next"`
			} `json:"paging"`
			Error *struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if err := metaGet(ctx, next, &payload); err != nil || payload.Error != nil {
			return
		}
		for _, ad := range payload.Data {
			c := ad.Creative
			img := firstNonEmpty(c.ImageURL, c.ObjectStory.LinkData.Picture, c.ObjectStory.VideoData.ImageURL, c.ThumbnailURL)
			afTitle, afBody := "", ""
			if len(c.AssetFeed.Titles) > 0 {
				afTitle = c.AssetFeed.Titles[0].Text
			}
			if len(c.AssetFeed.Bodies) > 0 {
				afBody = c.AssetFeed.Bodies[0].Text
			}
			title := firstNonEmpty(c.Title, c.ObjectStory.LinkData.Name, c.ObjectStory.VideoData.Title, afTitle)
			body := firstNonEmpty(c.Body, c.ObjectStory.LinkData.Message, c.ObjectStory.VideoData.Message, afBody)
			if ad.ID == "" || img == "" {
				continue
			}
			_, _ = s.pool.Exec(ctx,
				`INSERT INTO ad_creatives (organization_id, ad_account_id, ad_external_id, image_url, title, body)
				 VALUES ($1,$2,$3,NULLIF($4,''),NULLIF($5,''),NULLIF($6,''))
				 ON CONFLICT (organization_id, ad_external_id)
				 DO UPDATE SET image_url=EXCLUDED.image_url, title=EXCLUDED.title, body=EXCLUDED.body, synced_at=now()`,
				orgID, accountID, ad.ID, img, title, body)
		}
		next = payload.Paging.Next
	}
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func (s *server) markAdAccountError(ctx context.Context, accountID, msg string) {
	if len(msg) > 500 {
		msg = msg[:500]
	}
	_, _ = s.pool.Exec(ctx, `UPDATE ad_accounts SET status='error', last_error=$2 WHERE id=$1`, accountID, msg)
}

func (s *server) upsertAdCampaign(ctx context.Context, orgID, accountID, extID, name string) (string, error) {
	var id string
	err := s.pool.QueryRow(ctx,
		`INSERT INTO ad_campaigns (organization_id, ad_account_id, platform, external_id, name)
		 VALUES ($1,$2,'meta',$3,$4)
		 ON CONFLICT (ad_account_id, external_id)
		 DO UPDATE SET name = EXCLUDED.name
		 RETURNING id::text`,
		orgID, accountID, extID, name).Scan(&id)
	return id, err
}

func (s *server) upsertAdMetric(ctx context.Context, orgID, accountID, adCampaignID string, in metaInsight, currency string) {
	_, _ = s.pool.Exec(ctx,
		`INSERT INTO ad_metrics (organization_id, ad_account_id, ad_campaign_id, date, impressions, reach, clicks, results, spend, currency)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULLIF($10,''))
		 ON CONFLICT (ad_campaign_id, date)
		 DO UPDATE SET impressions=EXCLUDED.impressions, reach=EXCLUDED.reach, clicks=EXCLUDED.clicks,
		               results=EXCLUDED.results, spend=EXCLUDED.spend, currency=EXCLUDED.currency`,
		orgID, accountID, adCampaignID, in.DateStart,
		atoiSafe(in.Impressions), atoiSafe(in.Reach), atoiSafe(in.Clicks), metaResults(in), atofSafe(in.Spend), currency)
}

// metaResults derives a representative "results" count: prefer messaging
// conversations started (CTWA), else leads.
func metaResults(in metaInsight) int64 {
	var msg, lead int64
	for _, ac := range in.Actions {
		v := atoiSafe(ac.Value)
		switch {
		case strings.Contains(ac.ActionType, "messaging_conversation_started"):
			msg += v
		case ac.ActionType == "lead" || strings.Contains(ac.ActionType, "leadgen") || strings.Contains(ac.ActionType, "lead_grouped"):
			lead += v
		}
	}
	if msg > 0 {
		return msg
	}
	return lead
}

func metaAccountInfo(ctx context.Context, extID, token string) (currency, name string, err error) {
	u := fmt.Sprintf("https://graph.facebook.com/%s/act_%s?fields=currency,name&access_token=%s", metaGraphVersion, extID, url.QueryEscape(token))
	var out struct {
		Currency string `json:"currency"`
		Name     string `json:"name"`
	}
	if err = metaGet(ctx, u, &out); err != nil {
		return "", "", err
	}
	return out.Currency, out.Name, nil
}

func metaGet(ctx context.Context, u string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return err
	}
	resp, err := adHTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return json.NewDecoder(resp.Body).Decode(out)
}

func atoiSafe(s string) int64 {
	f, _ := strconv.ParseFloat(strings.TrimSpace(s), 64)
	return int64(f)
}
func atofSafe(s string) float64 {
	f, _ := strconv.ParseFloat(strings.TrimSpace(s), 64)
	return f
}

func cfgStr(cfg map[string]any, key string) string {
	if v, ok := cfg[key].(string); ok {
		return strings.TrimSpace(v)
	}
	return ""
}

func (s *server) loadAdAccount(ctx context.Context, accountID, orgID string) (extID, token string, cfg map[string]any, err error) {
	var raw []byte
	err = s.pool.QueryRow(ctx,
		`SELECT external_account_id, COALESCE(access_token,''), COALESCE(config,'{}'::jsonb)
		   FROM ad_accounts WHERE id=$1 AND organization_id=$2`, accountID, orgID).Scan(&extID, &token, &raw)
	if err != nil {
		return "", "", nil, err
	}
	cfg = map[string]any{}
	_ = json.Unmarshal(raw, &cfg)
	if token == "" {
		return extID, token, cfg, fmt.Errorf("no access token on file")
	}
	return extID, token, cfg, nil
}

// ── TikTok Marketing API fetcher ─────────────────────────────

func (s *server) syncTikTokAccount(ctx context.Context, accountID, orgID string) error {
	advertiserID, token, _, err := s.loadAdAccount(ctx, accountID, orgID)
	if err != nil {
		return err
	}
	until := time.Now().Format("2006-01-02")
	since := time.Now().AddDate(0, 0, -90).Format("2006-01-02")
	for page := 1; page <= 25; page++ {
		q := url.Values{}
		q.Set("advertiser_id", advertiserID)
		q.Set("report_type", "BASIC")
		q.Set("data_level", "AUCTION_CAMPAIGN")
		q.Set("dimensions", `["campaign_id","stat_time_day"]`)
		q.Set("metrics", `["campaign_name","spend","impressions","reach","clicks","conversion"]`)
		q.Set("start_date", since)
		q.Set("end_date", until)
		q.Set("page", strconv.Itoa(page))
		q.Set("page_size", "1000")
		u := "https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?" + q.Encode()

		var out struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
			Data    struct {
				List []struct {
					Dimensions map[string]any `json:"dimensions"`
					Metrics    map[string]any `json:"metrics"`
				} `json:"list"`
				PageInfo struct {
					TotalPage int `json:"total_page"`
				} `json:"page_info"`
			} `json:"data"`
		}
		if err := httpGetJSON(ctx, u, map[string]string{"Access-Token": token}, &out); err != nil {
			s.markAdAccountError(ctx, accountID, err.Error())
			return err
		}
		if out.Code != 0 {
			s.markAdAccountError(ctx, accountID, out.Message)
			return fmt.Errorf("tiktok: %s", out.Message)
		}
		for _, row := range out.Data.List {
			extCampID := anyStr(row.Dimensions["campaign_id"])
			day := anyStr(row.Dimensions["stat_time_day"])
			if len(day) >= 10 {
				day = day[:10]
			}
			if extCampID == "" || day == "" {
				continue
			}
			acID, err := s.upsertAdCampaignP(ctx, orgID, accountID, "tiktok", extCampID, anyStr(row.Metrics["campaign_name"]))
			if err != nil {
				continue
			}
			s.upsertAdMetricRaw(ctx, orgID, accountID, acID, day,
				int64(anyFloat(row.Metrics["impressions"])), int64(anyFloat(row.Metrics["reach"])),
				int64(anyFloat(row.Metrics["clicks"])), int64(anyFloat(row.Metrics["conversion"])),
				anyFloat(row.Metrics["spend"]), "")
		}
		if page >= out.Data.PageInfo.TotalPage {
			break
		}
	}
	_, _ = s.pool.Exec(ctx, `UPDATE ad_accounts SET last_synced_at=now(), status='connected', last_error=NULL WHERE id=$1`, accountID)
	return nil
}

// ── Google Ads API fetcher ───────────────────────────────────
// access_token field holds the OAuth refresh token; config carries
// {developer_token, client_id, client_secret, login_customer_id}.

func (s *server) syncGoogleAccount(ctx context.Context, accountID, orgID string) error {
	customerID, refreshToken, cfg, err := s.loadAdAccount(ctx, accountID, orgID)
	if err != nil {
		return err
	}
	devToken := os.Getenv("GOOGLE_ADS_DEVELOPER_TOKEN")
	clientID := os.Getenv("GOOGLE_ADS_CLIENT_ID")
	clientSecret := os.Getenv("GOOGLE_ADS_CLIENT_SECRET")
	loginCID := strings.ReplaceAll(cfgStr(cfg, "login_customer_id"), "-", "")
	if devToken == "" || clientID == "" || clientSecret == "" {
		err := fmt.Errorf("google requires developer_token, client_id and client_secret")
		s.markAdAccountError(ctx, accountID, err.Error())
		return err
	}

	// 1. refresh -> access token
	form := url.Values{}
	form.Set("client_id", clientID)
	form.Set("client_secret", clientSecret)
	form.Set("refresh_token", refreshToken)
	form.Set("grant_type", "refresh_token")
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, "https://oauth2.googleapis.com/token", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := adHTTP.Do(req)
	if err != nil {
		s.markAdAccountError(ctx, accountID, err.Error())
		return err
	}
	var tok struct {
		AccessToken string `json:"access_token"`
		Error       string `json:"error_description"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&tok)
	resp.Body.Close()
	if tok.AccessToken == "" {
		msg := tok.Error
		if msg == "" {
			msg = "could not refresh google token"
		}
		s.markAdAccountError(ctx, accountID, msg)
		return fmt.Errorf("google: %s", msg)
	}

	// 2. GAQL searchStream (campaign metrics by day)
	until := time.Now().Format("2006-01-02")
	since := time.Now().AddDate(0, 0, -90).Format("2006-01-02")
	gaql := fmt.Sprintf(`{"query":"SELECT campaign.id, campaign.name, segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date BETWEEN '%s' AND '%s'"}`, since, until)
	u := fmt.Sprintf("https://googleads.googleapis.com/v17/customers/%s/googleAds:searchStream", customerID)
	greq, _ := http.NewRequestWithContext(ctx, http.MethodPost, u, strings.NewReader(gaql))
	greq.Header.Set("Authorization", "Bearer "+tok.AccessToken)
	greq.Header.Set("developer-token", devToken)
	if loginCID != "" {
		greq.Header.Set("login-customer-id", loginCID)
	}
	greq.Header.Set("Content-Type", "application/json")
	gresp, err := adHTTP.Do(greq)
	if err != nil {
		s.markAdAccountError(ctx, accountID, err.Error())
		return err
	}
	defer gresp.Body.Close()
	// searchStream returns an array of result batches.
	var batches []struct {
		Results []struct {
			Campaign struct {
				ID   string `json:"id"`
				Name string `json:"name"`
			} `json:"campaign"`
			Segments struct {
				Date string `json:"date"`
			} `json:"segments"`
			Metrics struct {
				Impressions string  `json:"impressions"`
				Clicks      string  `json:"clicks"`
				CostMicros  string  `json:"costMicros"`
				Conversions float64 `json:"conversions"`
			} `json:"metrics"`
		} `json:"results"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.NewDecoder(gresp.Body).Decode(&batches); err != nil {
		s.markAdAccountError(ctx, accountID, "google: "+err.Error())
		return err
	}
	for _, b := range batches {
		if b.Error != nil {
			s.markAdAccountError(ctx, accountID, b.Error.Message)
			return fmt.Errorf("google: %s", b.Error.Message)
		}
		for _, r := range b.Results {
			acID, err := s.upsertAdCampaignP(ctx, orgID, accountID, "google", r.Campaign.ID, r.Campaign.Name)
			if err != nil {
				continue
			}
			s.upsertAdMetricRaw(ctx, orgID, accountID, acID, r.Segments.Date,
				atoiSafe(r.Metrics.Impressions), 0, atoiSafe(r.Metrics.Clicks), int64(r.Metrics.Conversions),
				atofSafe(r.Metrics.CostMicros)/1e6, "")
		}
	}
	_, _ = s.pool.Exec(ctx, `UPDATE ad_accounts SET last_synced_at=now(), status='connected', last_error=NULL WHERE id=$1`, accountID)
	return nil
}

// ── Google Ads: top keywords (for the ads report) ────────────
// GET /api/ads/keywords?from&to — reuses the connected Google ad account's
// OAuth to run a keyword_view GAQL query. Account-level (all Google campaigns).
// Degrades to an empty list (not an error) when no Google account is connected
// or the call fails, so the report panel simply hides.
func (s *server) handleAdsKeywords(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var accountID string
	err := s.pool.QueryRow(r.Context(),
		`SELECT id::text FROM ad_accounts
		  WHERE organization_id=$1 AND platform='google' AND COALESCE(access_token,'')<>''
		  ORDER BY last_synced_at DESC NULLS LAST LIMIT 1`, a.OrgID).Scan(&accountID)
	if err != nil {
		writeJSON(w, []any{})
		return
	}
	rows, err := s.googleTopKeywords(r.Context(), accountID, a.OrgID, r.URL.Query().Get("from"), r.URL.Query().Get("to"))
	if err != nil {
		writeJSON(w, []any{})
		return
	}
	writeJSON(w, rows)
}

func (s *server) googleTopKeywords(ctx context.Context, accountID, orgID, from, to string) ([]map[string]any, error) {
	customerID, refreshToken, cfg, err := s.loadAdAccount(ctx, accountID, orgID)
	if err != nil {
		return nil, err
	}
	devToken := os.Getenv("GOOGLE_ADS_DEVELOPER_TOKEN")
	clientID := os.Getenv("GOOGLE_ADS_CLIENT_ID")
	clientSecret := os.Getenv("GOOGLE_ADS_CLIENT_SECRET")
	loginCID := strings.ReplaceAll(cfgStr(cfg, "login_customer_id"), "-", "")
	if devToken == "" || clientID == "" || clientSecret == "" {
		return nil, fmt.Errorf("google ads not configured")
	}

	// refresh -> access token
	form := url.Values{}
	form.Set("client_id", clientID)
	form.Set("client_secret", clientSecret)
	form.Set("refresh_token", refreshToken)
	form.Set("grant_type", "refresh_token")
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, "https://oauth2.googleapis.com/token", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := adHTTP.Do(req)
	if err != nil {
		return nil, err
	}
	var tok struct {
		AccessToken string `json:"access_token"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&tok)
	resp.Body.Close()
	if tok.AccessToken == "" {
		return nil, fmt.Errorf("could not refresh google token")
	}

	if from == "" || to == "" {
		to = time.Now().Format("2006-01-02")
		from = time.Now().AddDate(0, 0, -30).Format("2006-01-02")
	}
	gaql := fmt.Sprintf(`{"query":"SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM keyword_view WHERE segments.date BETWEEN '%s' AND '%s' AND ad_group_criterion.status != 'REMOVED' ORDER BY metrics.impressions DESC LIMIT 50"}`, from, to)
	u := fmt.Sprintf("https://googleads.googleapis.com/v17/customers/%s/googleAds:searchStream", customerID)
	greq, _ := http.NewRequestWithContext(ctx, http.MethodPost, u, strings.NewReader(gaql))
	greq.Header.Set("Authorization", "Bearer "+tok.AccessToken)
	greq.Header.Set("developer-token", devToken)
	if loginCID != "" {
		greq.Header.Set("login-customer-id", loginCID)
	}
	greq.Header.Set("Content-Type", "application/json")
	gresp, err := adHTTP.Do(greq)
	if err != nil {
		return nil, err
	}
	defer gresp.Body.Close()

	var batches []struct {
		Results []struct {
			AdGroupCriterion struct {
				Keyword struct {
					Text      string `json:"text"`
					MatchType string `json:"matchType"`
				} `json:"keyword"`
			} `json:"adGroupCriterion"`
			Metrics struct {
				Impressions string  `json:"impressions"`
				Clicks      string  `json:"clicks"`
				CostMicros  string  `json:"costMicros"`
				Conversions float64 `json:"conversions"`
			} `json:"metrics"`
		} `json:"results"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.NewDecoder(gresp.Body).Decode(&batches); err != nil {
		return nil, err
	}

	// keyword_view repeats a keyword across ad groups; aggregate by text.
	type kwAgg struct {
		text        string
		matchType   string
		impressions int64
		clicks      int64
		conv        int64
		cost        float64
	}
	byKey := map[string]*kwAgg{}
	for _, b := range batches {
		if b.Error != nil {
			return nil, fmt.Errorf("google: %s", b.Error.Message)
		}
		for _, r := range b.Results {
			text := r.AdGroupCriterion.Keyword.Text
			if text == "" {
				continue
			}
			key := strings.ToLower(text)
			g := byKey[key]
			if g == nil {
				g = &kwAgg{text: text, matchType: r.AdGroupCriterion.Keyword.MatchType}
				byKey[key] = g
			}
			g.impressions += atoiSafe(r.Metrics.Impressions)
			g.clicks += atoiSafe(r.Metrics.Clicks)
			g.conv += int64(r.Metrics.Conversions)
			g.cost += atofSafe(r.Metrics.CostMicros) / 1e6
		}
	}
	rows := make([]map[string]any, 0, len(byKey))
	for _, g := range byKey {
		ctr := 0.0
		if g.impressions > 0 {
			ctr = float64(g.clicks) / float64(g.impressions) * 100
		}
		rows = append(rows, map[string]any{
			"keyword": g.text, "match_type": g.matchType,
			"impressions": g.impressions, "clicks": g.clicks,
			"ctr": ctr, "cost": g.cost, "conversions": g.conv,
		})
	}
	sort.Slice(rows, func(i, j int) bool {
		return rows[i]["impressions"].(int64) > rows[j]["impressions"].(int64)
	})
	if len(rows) > 10 {
		rows = rows[:10]
	}
	return rows, nil
}

// ── shared upsert / http helpers ─────────────────────────────

func (s *server) upsertAdCampaignP(ctx context.Context, orgID, accountID, platform, extID, name string) (string, error) {
	var id string
	err := s.pool.QueryRow(ctx,
		`INSERT INTO ad_campaigns (organization_id, ad_account_id, platform, external_id, name)
		 VALUES ($1,$2,$3,$4,$5)
		 ON CONFLICT (ad_account_id, external_id)
		 DO UPDATE SET name = EXCLUDED.name
		 RETURNING id::text`,
		orgID, accountID, platform, extID, name).Scan(&id)
	return id, err
}

func (s *server) upsertAdMetricRaw(ctx context.Context, orgID, accountID, adCampaignID, date string, impressions, reach, clicks, results int64, spend float64, currency string) {
	if date == "" {
		return
	}
	_, _ = s.pool.Exec(ctx,
		`INSERT INTO ad_metrics (organization_id, ad_account_id, ad_campaign_id, date, impressions, reach, clicks, results, spend, currency)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULLIF($10,''))
		 ON CONFLICT (ad_campaign_id, date)
		 DO UPDATE SET impressions=EXCLUDED.impressions, reach=EXCLUDED.reach, clicks=EXCLUDED.clicks,
		               results=EXCLUDED.results, spend=EXCLUDED.spend, currency=EXCLUDED.currency`,
		orgID, accountID, adCampaignID, date, impressions, reach, clicks, results, spend, currency)
}

func httpGetJSON(ctx context.Context, u string, headers map[string]string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := adHTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return json.NewDecoder(resp.Body).Decode(out)
}

func anyStr(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64)
	}
	return ""
}
func anyFloat(v any) float64 {
	switch t := v.(type) {
	case float64:
		return t
	case string:
		return atofSafe(t)
	}
	return 0
}

// ── Daily auto-sync cron ─────────────────────────────────────
// Hourly tick; syncs any account whose metrics are older than ~20h, giving a
// daily refresh that also self-heals after deploys without re-pulling fresh data.

func (s *server) startAdSyncCron(ctx context.Context) {
	go func() {
		// Small startup delay so a deploy isn't immediately hammered.
		t := time.NewTimer(2 * time.Minute)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				s.syncStaleAdAccounts(ctx)
				t.Reset(time.Hour)
			}
		}
	}()
}

func (s *server) syncStaleAdAccounts(ctx context.Context) {
	rows, err := s.pool.Query(ctx,
		`SELECT id::text, organization_id::text, platform
		   FROM ad_accounts
		  WHERE status <> 'error'
		    AND (last_synced_at IS NULL OR last_synced_at < now() - interval '20 hours')`)
	if err != nil {
		s.log.Warn("ad sync cron query failed", "err", err)
		return
	}
	type acct struct{ id, org, platform string }
	var list []acct
	for rows.Next() {
		var a acct
		if err := rows.Scan(&a.id, &a.org, &a.platform); err == nil {
			list = append(list, a)
		}
	}
	rows.Close()
	for _, a := range list {
		if err := s.syncAccount(ctx, a.id, a.org, a.platform); err != nil {
			s.log.Warn("ad auto-sync failed", "account", a.id, "platform", a.platform, "err", err)
		} else {
			s.log.Info("ad auto-sync ok", "account", a.id, "platform", a.platform)
		}
	}
}

// -- Google Ads OAuth -----------------------------------------

type oauthState struct {
	OrgID      string `json:"org_id"`
	UserID     string `json:"user_id"`
	CustomerID string `json:"customer_id"`
	Name       string `json:"name"`
}

func (s *server) handleGoogleAdsConnect(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var body struct {
		CustomerID string `json:"customer_id"`
		Name       string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	stateID := uuid.New().String()
	b, _ := json.Marshal(oauthState{OrgID: a.OrgID, UserID: a.UserID, CustomerID: body.CustomerID, Name: body.Name})
	s.rdb.Set(r.Context(), "oauth:googleads:"+stateID, b, 15*time.Minute)

	clientID := os.Getenv("GOOGLE_ADS_CLIENT_ID")
	redirectURI := os.Getenv("GOOGLE_ADS_REDIRECT_URL")

	url := fmt.Sprintf("https://accounts.google.com/o/oauth2/v2/auth?client_id=%s&redirect_uri=%s&response_type=code&scope=%s&access_type=offline&prompt=consent&state=%s",
		clientID, url.QueryEscape(redirectURI), url.QueryEscape("https://www.googleapis.com/auth/adwords"), stateID)

	writeJSON(w, map[string]string{"url": url})
}

func (s *server) handleGoogleAdsCallback(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	stateID := r.URL.Query().Get("state")
	if code == "" || stateID == "" {
		http.Error(w, "missing code or state", http.StatusBadRequest)
		return
	}

	b, err := s.rdb.Get(r.Context(), "oauth:googleads:"+stateID).Bytes()
	if err != nil {
		http.Error(w, "invalid or expired state", http.StatusBadRequest)
		return
	}
	var state oauthState
	json.Unmarshal(b, &state)

	clientID := os.Getenv("GOOGLE_ADS_CLIENT_ID")
	clientSecret := os.Getenv("GOOGLE_ADS_CLIENT_SECRET")
	redirectURI := os.Getenv("GOOGLE_ADS_REDIRECT_URL")

	data := url.Values{}
	data.Set("client_id", clientID)
	data.Set("client_secret", clientSecret)
	data.Set("code", code)
	data.Set("redirect_uri", redirectURI)
	data.Set("grant_type", "authorization_code")

	resp, err := adHTTP.PostForm("https://oauth2.googleapis.com/token", data)
	if err != nil {
		http.Error(w, "failed to exchange token", http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	var tokenResp struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil || tokenResp.RefreshToken == "" {
		http.Error(w, "no refresh token received (maybe you need to revoke access first)", http.StatusBadRequest)
		return
	}

	cfg, _ := json.Marshal(map[string]any{}) // config is empty now, credentials are in .env
	var id string
	err = s.pool.QueryRow(r.Context(),
		`INSERT INTO ad_accounts (organization_id, platform, external_account_id, name, access_token, config)
		 VALUES (,'google',,,,)
		 ON CONFLICT (organization_id, platform, external_account_id)
		 DO UPDATE SET access_token = EXCLUDED.access_token, name = COALESCE(NULLIF(EXCLUDED.name,''), ad_accounts.name),
		               config = EXCLUDED.config, status='connected', last_error=NULL
		 RETURNING id::text`,
		state.OrgID, state.CustomerID, state.Name, tokenResp.RefreshToken, cfg).Scan(&id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	go s.syncAccount(context.Background(), id, state.OrgID, "google")

	appBase := config.Get("APP_BASE_URL", "http://localhost:3000")
	http.Redirect(w, r, appBase+"/settings/channels?connected=google", http.StatusTemporaryRedirect)
}


// -- Meta Ads OAuth -----------------------------------------

func (s *server) handleMetaAdsConnect(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	if a.OrgID == "" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var body struct {
		AccountID string `json:"account_id"`
		Name      string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.AccountID == "" {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	stateID := uuid.New().String()
	b, _ := json.Marshal(oauthState{OrgID: a.OrgID, UserID: a.UserID, CustomerID: body.AccountID, Name: body.Name})
	s.rdb.Set(r.Context(), "oauth:metaads:"+stateID, b, 15*time.Minute)

	clientID := os.Getenv("META_CLIENT_ID")
	redirectURI := os.Getenv("META_REDIRECT_URL")

	// Graph API OAuth URL
	url := fmt.Sprintf("https://www.facebook.com/v19.0/dialog/oauth?client_id=%s&redirect_uri=%s&state=%s&scope=%s",
		clientID, url.QueryEscape(redirectURI), stateID, url.QueryEscape("ads_read,leads_retrieval,pages_show_list,pages_manage_ads"))

	writeJSON(w, map[string]string{"url": url})
}

func (s *server) handleMetaAdsCallback(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	stateID := r.URL.Query().Get("state")
	if code == "" || stateID == "" {
		http.Error(w, "missing code or state", http.StatusBadRequest)
		return
	}

	b, err := s.rdb.Get(r.Context(), "oauth:metaads:"+stateID).Bytes()
	if err != nil {
		http.Error(w, "invalid or expired state", http.StatusBadRequest)
		return
	}
	var state oauthState
	json.Unmarshal(b, &state)

	clientID := os.Getenv("META_CLIENT_ID")
	clientSecret := os.Getenv("META_APP_SECRET")
	redirectURI := os.Getenv("META_REDIRECT_URL")

	// 1. Exchange code for short-lived token
	tokenURL := fmt.Sprintf("https://graph.facebook.com/v19.0/oauth/access_token?client_id=%s&redirect_uri=%s&client_secret=%s&code=%s",
		clientID, url.QueryEscape(redirectURI), clientSecret, code)

	resp, err := http.Get(tokenURL)
	if err != nil {
		http.Error(w, "failed to exchange token", http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	var tokenResp struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil || tokenResp.AccessToken == "" {
		http.Error(w, "failed to get access token", http.StatusBadRequest)
		return
	}

	// 2. Exchange for long-lived token
	longTokenURL := fmt.Sprintf("https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=%s&client_secret=%s&fb_exchange_token=%s",
		clientID, clientSecret, tokenResp.AccessToken)
	resp2, err := http.Get(longTokenURL)
	if err != nil {
		http.Error(w, "failed to get long-lived token", http.StatusInternalServerError)
		return
	}
	defer resp2.Body.Close()

	var longTokenResp struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(resp2.Body).Decode(&longTokenResp); err == nil && longTokenResp.AccessToken != "" {
		tokenResp.AccessToken = longTokenResp.AccessToken
	}

	cfg, _ := json.Marshal(map[string]any{})
	var id string
	err = s.pool.QueryRow(r.Context(),
		`INSERT INTO ad_accounts (organization_id, platform, external_account_id, name, access_token, config)
		 VALUES ($1,'meta',$2,$3,$4,$5)
		 ON CONFLICT (organization_id, platform, external_account_id)
		 DO UPDATE SET access_token = EXCLUDED.access_token, name = COALESCE(NULLIF(EXCLUDED.name,''), ad_accounts.name),
		               config = EXCLUDED.config, status='connected', last_error=NULL
		 RETURNING id::text`,
		state.OrgID, state.CustomerID, state.Name, tokenResp.AccessToken, cfg).Scan(&id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	go s.syncAccount(context.Background(), id, state.OrgID, "meta")

	appBase := config.Get("APP_BASE_URL", "http://localhost:3000")
	http.Redirect(w, r, appBase+"/settings/channels?connected=meta", http.StatusTemporaryRedirect)
}

// -- TikTok Ads OAuth ---------------------------------------

func (s *server) handleTikTokAdsConnect(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	if a.OrgID == "" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var body struct {
		AdvertiserID string `json:"advertiser_id"`
		Name         string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.AdvertiserID == "" {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	stateID := uuid.New().String()
	b, _ := json.Marshal(oauthState{OrgID: a.OrgID, UserID: a.UserID, CustomerID: body.AdvertiserID, Name: body.Name})
	s.rdb.Set(r.Context(), "oauth:tiktokads:"+stateID, b, 15*time.Minute)

	appID := os.Getenv("TIKTOK_APP_ID")
	redirectURI := os.Getenv("TIKTOK_REDIRECT_URL")

	url := fmt.Sprintf("https://business-api.tiktok.com/portal/auth?app_id=%s&state=%s&redirect_uri=%s",
		appID, stateID, url.QueryEscape(redirectURI))

	writeJSON(w, map[string]string{"url": url})
}

func (s *server) handleTikTokAdsCallback(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("auth_code")
	stateID := r.URL.Query().Get("state")
	if code == "" || stateID == "" {
		http.Error(w, "missing auth_code or state", http.StatusBadRequest)
		return
	}

	val, err := s.rdb.Get(r.Context(), "oauth:tiktokads:"+stateID).Result()
	if err != nil {
		http.Error(w, "invalid or expired state", http.StatusBadRequest)
		return
	}
	var st oauthState
	json.Unmarshal([]byte(val), &st)

	appID := os.Getenv("TIKTOK_APP_ID")
	secret := os.Getenv("TIKTOK_APP_SECRET")

	bodyBytes, _ := json.Marshal(map[string]string{
		"app_id":    appID,
		"secret":    secret,
		"auth_code": code,
	})

	req, _ := http.NewRequest("POST", "https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		http.Error(w, "failed to get token: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	var res struct {
		Code int `json:"code"`
		Data struct {
			AccessToken          string `json:"access_token"`
			AdvertiserIDs        []string `json:"advertiser_ids"`
		} `json:"data"`
		Message string `json:"message"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		http.Error(w, "failed to decode response", http.StatusInternalServerError)
		return
	}
	if res.Code != 0 || res.Data.AccessToken == "" {
		http.Error(w, "tiktok oauth error: "+res.Message, http.StatusBadRequest)
		return
	}

	cfg, _ := json.Marshal(map[string]any{})
	var id string
	err = s.pool.QueryRow(r.Context(),
		`INSERT INTO ad_accounts (organization_id, platform, external_account_id, name, access_token, config)
		 VALUES ($1,'tiktok',$2,$3,$4,$5)
		 ON CONFLICT (organization_id, platform, external_account_id)
		 DO UPDATE SET access_token = EXCLUDED.access_token, name = COALESCE(NULLIF(EXCLUDED.name,''), ad_accounts.name),
		               config = EXCLUDED.config, status='connected', last_error=NULL
		 RETURNING id::text`,
		st.OrgID, st.CustomerID, st.Name, res.Data.AccessToken, cfg).Scan(&id)

	if err != nil {
		http.Error(w, "db error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	go s.syncAccount(context.Background(), id, st.OrgID, "tiktok")

	s.rdb.Del(r.Context(), "oauth:tiktokads:"+stateID)
	http.Redirect(w, r, "https://app.simpulx.com/settings/channels?success=tiktok_ads_connected", http.StatusTemporaryRedirect)
}
