package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
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
		        last_synced_at, last_error, created_at,
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
		Platform          string `json:"platform"`
		ExternalAccountID string `json:"external_account_id"`
		Name              string `json:"name"`
		AccessToken       string `json:"access_token"`
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
	if b.ExternalAccountID == "" || b.AccessToken == "" {
		http.Error(w, "account id and access token are required", http.StatusBadRequest)
		return
	}
	var id string
	err := s.pool.QueryRow(r.Context(),
		`INSERT INTO ad_accounts (organization_id, platform, external_account_id, name, access_token)
		 VALUES ($1,$2,$3,$4,$5)
		 ON CONFLICT (organization_id, platform, external_account_id)
		 DO UPDATE SET access_token = EXCLUDED.access_token, name = COALESCE(NULLIF(EXCLUDED.name,''), ad_accounts.name), status='connected', last_error=NULL
		 RETURNING id::text`,
		a.OrgID, b.Platform, b.ExternalAccountID, b.Name, b.AccessToken).Scan(&id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.audit(r.Context(), a, "connected", "ad_account", id, map[string]any{"platform": b.Platform, "account": b.ExternalAccountID})
	// Best-effort first sync so the dashboard isn't empty.
	if b.Platform == "meta" {
		if err := s.syncMetaAccount(r.Context(), id, a.OrgID); err != nil {
			writeJSON(w, map[string]any{"id": id, "sync_error": err.Error()})
			return
		}
	}
	writeJSON(w, map[string]any{"id": id})
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
	switch platform {
	case "meta":
		if err := s.syncMetaAccount(r.Context(), id, a.OrgID); err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
	default:
		http.Error(w, platform+" sync is not available yet (Meta is live; TikTok and Google are coming)", http.StatusNotImplemented)
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
		        aa.name AS account_name,
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

// PATCH /api/ad-campaigns/{id} — map an ad campaign to one of OUR campaigns.
func (s *server) handlePatchAdCampaign(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	id := r.PathValue("id")
	var b struct {
		CampaignID *string `json:"campaign_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	tag, err := s.pool.Exec(r.Context(),
		`UPDATE ad_campaigns SET campaign_id = NULLIF($3,'')::uuid
		   WHERE id = $1 AND organization_id = $2`,
		id, a.OrgID, derefStr(b.CampaignID))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound)
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
		from = time.Now().AddDate(0, 0, -29).Format("2006-01-02")
	}
	camp := r.URL.Query().Get("campaign_id")

	// Per-campaign: ad spend joined to OUR leads + sales (sale = reached the final stage).
	campRows, err := s.queryMaps(r.Context(),
		`SELECT c.id::text AS campaign_id, c.name AS campaign_name,
		        COALESCE(m.spend,0)::float8 AS spend, COALESCE(m.impressions,0)::bigint AS impressions,
		        COALESCE(m.reach,0)::bigint AS reach, COALESCE(m.clicks,0)::bigint AS clicks, COALESCE(m.results,0)::bigint AS results,
		        COALESCE(l.leads,0) AS leads, COALESCE(l.sales,0) AS sales
		   FROM campaigns c
		   LEFT JOIN (
		     SELECT ac.campaign_id,
		            sum(am.spend) spend, sum(am.impressions) impressions, sum(am.reach) reach,
		            sum(am.clicks) clicks, sum(am.results) results
		       FROM ad_metrics am JOIN ad_campaigns ac ON ac.id = am.ad_campaign_id
		      WHERE am.organization_id = $1 AND am.date BETWEEN $2 AND $3 AND ac.campaign_id IS NOT NULL
		      GROUP BY ac.campaign_id
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
		    AND (m.campaign_id IS NOT NULL OR l.leads > 0)
		  ORDER BY spend DESC, leads DESC, c.name`,
		a.OrgID, from, to)
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
	if camp != "" {
		dq += " AND ac.campaign_id = $4"
		args = append(args, camp)
	}
	dq += " GROUP BY am.date ORDER BY am.date DESC"
	dailyRows, err := s.queryMaps(r.Context(), dq, args...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, map[string]any{
		"from": from, "to": to,
		"campaigns": campRows,
		"daily":     dailyRows,
	})
}

// ── Meta Marketing API fetcher ───────────────────────────────

type metaInsight struct {
	CampaignID   string `json:"campaign_id"`
	CampaignName string `json:"campaign_name"`
	Impressions  string `json:"impressions"`
	Reach        string `json:"reach"`
	Clicks       string `json:"clicks"`
	Spend        string `json:"spend"`
	DateStart    string `json:"date_start"`
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
		_, _ = s.pool.Exec(ctx, `UPDATE ad_accounts SET currency=NULLIF($2,''), name=COALESCE(NULLIF($3,''),name) WHERE id=$1`, accountID, currency, name)
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
	_, _ = s.pool.Exec(ctx, `UPDATE ad_accounts SET last_synced_at=now(), status='connected', last_error=NULL WHERE id=$1`, accountID)
	return nil
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
