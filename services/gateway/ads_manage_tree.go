package main

// ── Manage Ads: Meta Ads Manager-like per-entity surface ────────────────────
//
// The Performance tab answers "how is it doing" and its pause/resume flips the
// whole campaign. This file is the EDITING surface for ads that already exist:
// the full campaign > ad set > ad tree with per-entity status, rename, ad set
// budget/schedule, and ad deletion — the operations a user expects after using
// Meta Ads Manager.
//
// Semantics deliberately match Meta, not the Performance toggle: a row toggle
// here flips ONLY that entity's configured status, with NO cascade. The tree
// carries effective_status so "ON but parent is off" is visible instead of
// surprising.
//
// The adset settings endpoint NEVER sends `targeting` (that stays owned by the
// Launch/apply flow): every targeting-update rejection Meta has thrown at us
// (targeting_automation on update, subcity folding) is avoided by construction.

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// Meta ids are plain digit strings; anything else never reaches a Graph URL.
var adsEntityIDRe = regexp.MustCompile(`^[0-9]{5,25}$`)

// verifyAdsEntity is the ownership check behind every per-entity write: the
// entity must live under one of THIS campaign's linked Meta campaigns. A miss
// is a plain 404 "not found" — the response must not confirm whether some
// foreign object id exists.
func (s *server) verifyAdsEntity(ctx context.Context, t adsTarget, level, entityID string) (string, string, int) {
	if !adsEntityIDRe.MatchString(entityID) {
		return "", "not found", http.StatusNotFound
	}
	allowed, err := s.adObjectIDs(ctx, t)
	if err != nil {
		return "", "could not resolve linked Meta campaigns", http.StatusInternalServerError
	}
	if len(allowed) == 0 {
		return "", "no Meta campaign is linked to this campaign yet", http.StatusConflict
	}
	in := func(id string) bool {
		for _, v := range allowed {
			if v == id {
				return true
			}
		}
		return false
	}
	if level == "campaign" {
		if !in(entityID) {
			return "", "not found", http.StatusNotFound
		}
		return entityID, "", 0
	}
	// Ad set / ad: one Graph read tells us which campaign the object belongs to.
	var payload struct {
		ID         string `json:"id"`
		CampaignID string `json:"campaign_id"`
		Error      *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	u := fmt.Sprintf("https://graph.facebook.com/%s/%s?fields=id,campaign_id&access_token=%s",
		metaGraphVersion, entityID, url.QueryEscape(t.token))
	if err := metaGet(ctx, u, &payload); err != nil || payload.Error != nil || payload.CampaignID == "" {
		return "", "not found", http.StatusNotFound
	}
	if !in(payload.CampaignID) {
		return "", "not found", http.StatusNotFound
	}
	return payload.CampaignID, "", 0
}

// logAdsManage puts a manual per-entity action on the same operator timeline
// the monitor and the campaign-level controls write to.
func (s *server) logAdsManage(ctx context.Context, a authInfo, t adsTarget, action, level, entityID, detail string) {
	_, _ = s.pool.Exec(ctx,
		`INSERT INTO ads_alerts (organization_id, campaign_id, alert_type, action_taken, detail, notified_at)
		 VALUES ($1::uuid, $2::uuid, 'manual_control', $3, $4, now())`,
		t.orgID, t.campaignID, action, detail)
	s.audit(ctx, a, action, "campaign", t.campaignID, map[string]any{
		"level": level, "entity": entityID,
	})
}

type manageMetrics struct {
	Spend       float64 `json:"spend"`
	Impressions int64   `json:"impressions"`
	Reach       int64   `json:"reach"`
	Clicks      int64   `json:"clicks"`
	Leads       int64   `json:"leads"`
	CTR         float64 `json:"ctr"`
	CPL         float64 `json:"cpl"`
}

type manageAd struct {
	ID              string        `json:"id"`
	Name            string        `json:"name"`
	Status          string        `json:"status"`
	EffectiveStatus string        `json:"effective_status"`
	CreatedTime     string        `json:"created_time"`
	Thumbnail       string        `json:"thumbnail"`
	Image           string        `json:"image"`
	Metrics         manageMetrics `json:"metrics"`
}

type manageAdset struct {
	ID               string        `json:"id"`
	Name             string        `json:"name"`
	Status           string        `json:"status"`
	EffectiveStatus  string        `json:"effective_status"`
	DailyBudget      int64         `json:"daily_budget"`
	BudgetRemaining  int64         `json:"budget_remaining"`
	StartTime        string        `json:"start_time"`
	EndTime          string        `json:"end_time"`
	CreatedTime      string        `json:"created_time"`
	OptimizationGoal string        `json:"optimization_goal"`
	DestinationType  string        `json:"destination_type"`
	Metrics          manageMetrics `json:"metrics"`
	Ads              []manageAd    `json:"ads"`
}

type manageCampaign struct {
	ID              string        `json:"id"`
	Name            string        `json:"name"`
	Status          string        `json:"status"`
	EffectiveStatus string        `json:"effective_status"`
	Objective       string        `json:"objective"`
	CreatedTime     string        `json:"created_time"`
	DailyBudget     int64         `json:"daily_budget"` // >0 = CBO: budget lives here, adset budget locked
	IsOwn           bool          `json:"is_own"`
	Metrics         manageMetrics `json:"metrics"`
	Adsets          []manageAdset `json:"adsets"`
}

// GET /api/campaigns/{id}/ads/manage — the full tree, statuses live from Graph,
// metrics (30d) joined from our synced tables.
func (s *server) handleAdsManageTree(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	t, msg, code := s.resolveAdsAny(r.Context(), a.OrgID, r.PathValue("id"))
	if msg != "" {
		http.Error(w, msg, code)
		return
	}
	ids, err := s.adObjectIDs(r.Context(), t)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if len(ids) > 5 {
		ids = ids[:5] // same fan-out cap as the live listing
	}

	var accountName string
	_ = s.pool.QueryRow(r.Context(),
		`SELECT name FROM ad_accounts WHERE id = $1::uuid`, t.accountID).Scan(&accountName)

	campaigns := []manageCampaign{}
	var firstErr string
	adIDs := []string{}

	for _, cid := range ids {
		// 1. Campaign node.
		var cp struct {
			ID              string `json:"id"`
			Name            string `json:"name"`
			Status          string `json:"status"`
			EffectiveStatus string `json:"effective_status"`
			Objective       string `json:"objective"`
			CreatedTime     string `json:"created_time"`
			DailyBudget     string `json:"daily_budget"`
			Error           *struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		u := fmt.Sprintf("https://graph.facebook.com/%s/%s?fields=id,name,status,effective_status,objective,created_time,daily_budget&access_token=%s",
			metaGraphVersion, cid, url.QueryEscape(t.token))
		if err := metaGet(r.Context(), u, &cp); err != nil || cp.Error != nil {
			if firstErr == "" {
				if cp.Error != nil {
					firstErr = cp.Error.Message
				} else if err != nil {
					firstErr = err.Error()
				}
			}
			continue
		}
		mc := manageCampaign{
			ID: cp.ID, Name: cp.Name, Status: cp.Status, EffectiveStatus: cp.EffectiveStatus,
			Objective: cp.Objective, CreatedTime: cp.CreatedTime,
			// IDR is an offset-1 currency: Graph budgets are whole rupiah already.
			// Any scaling here would make a Rp 20.000 budget read as Rp 2.000.000.
			DailyBudget: atoiSafe(cp.DailyBudget),
			IsOwn:       cp.ID == t.metaCampaign,
			Adsets:      []manageAdset{},
		}

		// 2. Ad sets under it.
		var asPayload struct {
			Data []struct {
				ID               string `json:"id"`
				Name             string `json:"name"`
				Status           string `json:"status"`
				EffectiveStatus  string `json:"effective_status"`
				DailyBudget      string `json:"daily_budget"`
				BudgetRemaining  string `json:"budget_remaining"`
				StartTime        string `json:"start_time"`
				EndTime          string `json:"end_time"`
				CreatedTime      string `json:"created_time"`
				OptimizationGoal string `json:"optimization_goal"`
				DestinationType  string `json:"destination_type"`
			} `json:"data"`
			Error *struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		u = fmt.Sprintf("https://graph.facebook.com/%s/%s/adsets?fields=id,name,status,effective_status,daily_budget,budget_remaining,start_time,end_time,created_time,optimization_goal,destination_type&limit=50&access_token=%s",
			metaGraphVersion, cid, url.QueryEscape(t.token))
		if err := metaGet(r.Context(), u, &asPayload); err != nil || asPayload.Error != nil {
			if firstErr == "" {
				if asPayload.Error != nil {
					firstErr = asPayload.Error.Message
				} else if err != nil {
					firstErr = err.Error()
				}
			}
		}
		adsetByID := map[string]int{}
		for _, as := range asPayload.Data {
			if as.EffectiveStatus == "DELETED" || as.EffectiveStatus == "ARCHIVED" {
				continue
			}
			mc.Adsets = append(mc.Adsets, manageAdset{
				ID: as.ID, Name: as.Name, Status: as.Status, EffectiveStatus: as.EffectiveStatus,
				DailyBudget: atoiSafe(as.DailyBudget), BudgetRemaining: atoiSafe(as.BudgetRemaining),
				StartTime: as.StartTime, EndTime: as.EndTime, CreatedTime: as.CreatedTime,
				OptimizationGoal: as.OptimizationGoal, DestinationType: as.DestinationType,
				Ads: []manageAd{},
			})
			adsetByID[as.ID] = len(mc.Adsets) - 1
		}

		// 3. Ads, grouped under their ad set. Same rich-then-plain creative
		// expansion retry as the live listing: a smaller thumbnail beats an
		// empty tree.
		var adPayload struct {
			Data []struct {
				ID              string `json:"id"`
				Name            string `json:"name"`
				Status          string `json:"status"`
				EffectiveStatus string `json:"effective_status"`
				AdsetID         string `json:"adset_id"`
				CreatedTime     string `json:"created_time"`
				Creative        *struct {
					ThumbnailURL string `json:"thumbnail_url"`
					ImageURL     string `json:"image_url"`
				} `json:"creative"`
			} `json:"data"`
			Error *struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		fetch := func(fields string) error {
			adPayload.Data = nil
			adPayload.Error = nil
			u := fmt.Sprintf("https://graph.facebook.com/%s/%s/ads?fields=%s&limit=100&access_token=%s",
				metaGraphVersion, cid, fields, url.QueryEscape(t.token))
			if err := metaGet(r.Context(), u, &adPayload); err != nil {
				return err
			}
			if adPayload.Error != nil {
				return fmt.Errorf("%s", adPayload.Error.Message)
			}
			return nil
		}
		err := fetch("id,name,status,effective_status,adset_id,created_time,creative.thumbnail_width(512).thumbnail_height(512){thumbnail_url,image_url}")
		if err != nil {
			s.log.Warn("ads manage rich fetch failed, retrying plain", "campaign", cid, "err", err)
			err = fetch("id,name,status,effective_status,adset_id,created_time,creative{thumbnail_url}")
		}
		if err != nil {
			if firstErr == "" {
				firstErr = err.Error()
			}
		}
		for _, ad := range adPayload.Data {
			if ad.EffectiveStatus == "DELETED" || ad.EffectiveStatus == "ARCHIVED" {
				continue
			}
			ma := manageAd{
				ID: ad.ID, Name: ad.Name, Status: ad.Status, EffectiveStatus: ad.EffectiveStatus,
				CreatedTime: ad.CreatedTime,
			}
			if ad.Creative != nil {
				ma.Thumbnail = ad.Creative.ThumbnailURL
				ma.Image = ad.Creative.ImageURL
			}
			adIDs = append(adIDs, ad.ID)
			if ix, ok := adsetByID[ad.AdsetID]; ok {
				mc.Adsets[ix].Ads = append(mc.Adsets[ix].Ads, ma)
			} else if len(mc.Adsets) > 0 {
				// Ad set filtered/unknown: keep the ad visible under the first set
				// rather than dropping it silently.
				mc.Adsets[0].Ads = append(mc.Adsets[0].Ads, ma)
			}
		}
		campaigns = append(campaigns, mc)
	}

	// Metrics: 30d spend/impressions/reach/clicks per ad + CTWA leads per ad.
	spendBy := map[string]manageMetrics{}
	if len(adIDs) > 0 {
		rows, err := s.pool.Query(r.Context(),
			`SELECT ad_external_id, COALESCE(sum(spend),0)::float8, COALESCE(sum(impressions),0)::bigint,
			        COALESCE(sum(reach),0)::bigint, COALESCE(sum(clicks),0)::bigint
			   FROM ad_ad_metrics
			  WHERE organization_id = $1 AND ad_external_id = ANY($2::text[])
			    AND date >= (now() - interval '30 days')::date
			  GROUP BY ad_external_id`, t.orgID, adIDs)
		if err == nil {
			for rows.Next() {
				var id string
				var m manageMetrics
				if rows.Scan(&id, &m.Spend, &m.Impressions, &m.Reach, &m.Clicks) == nil {
					spendBy[id] = m
				}
			}
			rows.Close()
		}
		lrows, err := s.pool.Query(r.Context(),
			`SELECT att.referral_source, count(DISTINCT att.conversation_id)
			   FROM conversation_attributions att
			   JOIN conversations cv ON cv.id = att.conversation_id
			  WHERE att.organization_id = $1 AND att.referral_source = ANY($2::text[])
			    AND cv.created_at >= now() - interval '30 days'
			  GROUP BY 1`, t.orgID, adIDs)
		if err == nil {
			for lrows.Next() {
				var id string
				var leads int64
				if lrows.Scan(&id, &leads) == nil {
					m := spendBy[id]
					m.Leads = leads
					spendBy[id] = m
				}
			}
			lrows.Close()
		}
	}
	finish := func(m *manageMetrics) {
		if m.Impressions > 0 {
			m.CTR = float64(m.Clicks) / float64(m.Impressions) * 100
		}
		if m.Leads > 0 {
			m.CPL = m.Spend / float64(m.Leads)
		}
	}
	for ci := range campaigns {
		for si := range campaigns[ci].Adsets {
			as := &campaigns[ci].Adsets[si]
			for ai := range as.Ads {
				ad := &as.Ads[ai]
				ad.Metrics = spendBy[ad.ID]
				finish(&ad.Metrics)
				// Roll up. Summed reach overcounts overlap between ads; fine for a
				// management surface, the Performance tab stays the reporting truth.
				as.Metrics.Spend += ad.Metrics.Spend
				as.Metrics.Impressions += ad.Metrics.Impressions
				as.Metrics.Reach += ad.Metrics.Reach
				as.Metrics.Clicks += ad.Metrics.Clicks
				as.Metrics.Leads += ad.Metrics.Leads
			}
			finish(&as.Metrics)
			campaigns[ci].Metrics.Spend += as.Metrics.Spend
			campaigns[ci].Metrics.Impressions += as.Metrics.Impressions
			campaigns[ci].Metrics.Reach += as.Metrics.Reach
			campaigns[ci].Metrics.Clicks += as.Metrics.Clicks
			campaigns[ci].Metrics.Leads += as.Metrics.Leads
		}
		finish(&campaigns[ci].Metrics)
	}

	if firstErr != "" {
		s.log.Warn("ads manage fetch failed", "campaign", t.campaignName, "err", firstErr)
	}
	writeJSON(w, map[string]any{
		"account_name": accountName,
		"access_mode":  t.accessMode,
		"can_edit":     t.accessMode == "manage",
		"window_days":  30,
		"campaigns":    campaigns,
		"error":        firstErr,
	})
}

// adsManageLevel validates the {level} path segment.
func adsManageLevel(r *http.Request) (string, bool) {
	l := r.PathValue("level")
	return l, l == "campaign" || l == "adset" || l == "ad"
}

// POST /api/campaigns/{id}/ads/{level}/{entityId}/status  {"status":"ACTIVE"|"PAUSED"}
// Flips ONE entity's configured status, no cascade (Meta semantics).
func (s *server) handleAdsEntityStatus(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	level, ok := adsManageLevel(r)
	if !ok {
		http.Error(w, "level must be campaign, adset or ad", http.StatusBadRequest)
		return
	}
	var b struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil || (b.Status != "ACTIVE" && b.Status != "PAUSED") {
		http.Error(w, "status must be ACTIVE or PAUSED", http.StatusBadRequest)
		return
	}
	t, msg, code := s.resolveAdsTarget(r.Context(), a.OrgID, r.PathValue("id"))
	if msg != "" {
		http.Error(w, msg, code)
		return
	}
	entityID := r.PathValue("entityId")
	if _, msg, code := s.verifyAdsEntity(r.Context(), t, level, entityID); msg != "" {
		http.Error(w, msg, code)
		return
	}
	if err := metaSetStatus(r.Context(), entityID, t.token, b.Status); err != nil {
		http.Error(w, "Meta rejected the change: "+err.Error(), http.StatusUnprocessableEntity)
		return
	}
	verb := "paused"
	if b.Status == "ACTIVE" {
		verb = "resumed"
	}
	// Local mirrors, best-effort: the dashboard should not wait for a sync.
	if level == "campaign" {
		state := "paused"
		if b.Status == "ACTIVE" {
			state = "active"
		}
		_, _ = s.pool.Exec(r.Context(),
			`UPDATE campaigns SET ads_status=$2, updated_at=now() WHERE id=$1::uuid AND meta_campaign_id=$3`,
			t.campaignID, state, entityID)
	}
	if level == "ad" {
		_, _ = s.pool.Exec(r.Context(),
			`UPDATE campaign_creatives SET status=$3 WHERE campaign_id=$1::uuid AND meta_ad_id=$2`,
			t.campaignID, entityID, map[string]string{"ACTIVE": "active", "PAUSED": "paused"}[b.Status])
	}
	s.logAdsManage(r.Context(), a, t, verb+"_"+level, level, entityID,
		fmt.Sprintf("Manual %s of %s %s by %s", verb, level, entityID, a.Name))
	writeJSON(w, map[string]any{"ok": true, "id": entityID, "level": level, "status": b.Status})
}

// POST /api/campaigns/{id}/ads/{level}/{entityId}/name  {"name":"..."}
func (s *server) handleAdsEntityRename(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	level, ok := adsManageLevel(r)
	if !ok {
		http.Error(w, "level must be campaign, adset or ad", http.StatusBadRequest)
		return
	}
	var b struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	b.Name = strings.TrimSpace(b.Name)
	if b.Name == "" || len(b.Name) > 200 {
		http.Error(w, "name required (max 200 characters)", http.StatusBadRequest)
		return
	}
	t, msg, code := s.resolveAdsTarget(r.Context(), a.OrgID, r.PathValue("id"))
	if msg != "" {
		http.Error(w, msg, code)
		return
	}
	entityID := r.PathValue("entityId")
	if _, msg, code := s.verifyAdsEntity(r.Context(), t, level, entityID); msg != "" {
		http.Error(w, msg, code)
		return
	}
	form := url.Values{}
	form.Set("name", b.Name)
	form.Set("access_token", t.token)
	u := fmt.Sprintf("https://graph.facebook.com/%s/%s", metaGraphVersion, entityID)
	if err := metaPostForm(r.Context(), u, form); err != nil {
		http.Error(w, "Meta rejected the change: "+err.Error(), http.StatusUnprocessableEntity)
		return
	}
	// The Simpulx campaign name is intentionally untouched: Meta names and our
	// campaign names are separate vocabularies.
	s.logAdsManage(r.Context(), a, t, "renamed_"+level, level, entityID,
		fmt.Sprintf("Renamed %s %s to %q by %s", level, entityID, b.Name, a.Name))
	writeJSON(w, map[string]any{"ok": true, "name": b.Name})
}

// POST /api/campaigns/{id}/ads/adset/{entityId}/settings
// {"daily_budget":20000, "start_time":"...", "end_time":"...", "clear_end_time":true}
// Only the provided fields are sent. Never touches targeting or status.
func (s *server) handleAdsetSettings(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var b struct {
		DailyBudget  *int64  `json:"daily_budget"`
		StartTime    *string `json:"start_time"`
		EndTime      *string `json:"end_time"`
		ClearEndTime bool    `json:"clear_end_time"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	if b.DailyBudget == nil && b.StartTime == nil && b.EndTime == nil && !b.ClearEndTime {
		http.Error(w, "nothing to update", http.StatusBadRequest)
		return
	}
	t, msg, code := s.resolveAdsTarget(r.Context(), a.OrgID, r.PathValue("id"))
	if msg != "" {
		http.Error(w, msg, code)
		return
	}
	adsetID := r.PathValue("entityId")
	parentCampaign, msg, code := s.verifyAdsEntity(r.Context(), t, "adset", adsetID)
	if msg != "" {
		http.Error(w, msg, code)
		return
	}

	form := url.Values{}
	form.Set("access_token", t.token)
	if b.DailyBudget != nil {
		// IDR offset-1: Graph budgets are whole rupiah. NO scaling — one stray
		// *100 turns Rp 20.000/day into Rp 2.000.000/day.
		if *b.DailyBudget < 10000 {
			http.Error(w, "daily budget looks too low for IDR (min about Rp 10.000)", http.StatusBadRequest)
			return
		}
		// CBO guard: a campaign-level budget means the adset budget is locked.
		var cb struct {
			DailyBudget string `json:"daily_budget"`
		}
		u := fmt.Sprintf("https://graph.facebook.com/%s/%s?fields=daily_budget&access_token=%s",
			metaGraphVersion, parentCampaign, url.QueryEscape(t.token))
		if metaGet(r.Context(), u, &cb) == nil && atoiSafe(cb.DailyBudget) > 0 {
			http.Error(w, "this ad set's budget is managed at campaign level (Advantage campaign budget)", http.StatusConflict)
			return
		}
		form.Set("daily_budget", fmt.Sprintf("%d", *b.DailyBudget))
	}
	var startT, endT time.Time
	if b.StartTime != nil && *b.StartTime != "" {
		st, err := time.Parse(time.RFC3339, *b.StartTime)
		if err != nil {
			http.Error(w, "start_time must be RFC3339", http.StatusBadRequest)
			return
		}
		startT = st
		form.Set("start_time", st.Format(time.RFC3339))
	}
	if b.ClearEndTime {
		// Documented Graph way to remove an end date: run continuously.
		form.Set("end_time", "0")
	} else if b.EndTime != nil && *b.EndTime != "" {
		et, err := time.Parse(time.RFC3339, *b.EndTime)
		if err != nil {
			http.Error(w, "end_time must be RFC3339", http.StatusBadRequest)
			return
		}
		if et.Before(time.Now()) {
			http.Error(w, "end_time must be in the future", http.StatusBadRequest)
			return
		}
		if !startT.IsZero() && !et.After(startT) {
			http.Error(w, "end_time must be after start_time", http.StatusBadRequest)
			return
		}
		endT = et
		form.Set("end_time", et.Format(time.RFC3339))
	}
	_ = endT

	u := fmt.Sprintf("https://graph.facebook.com/%s/%s", metaGraphVersion, adsetID)
	if err := metaPostForm(r.Context(), u, form); err != nil {
		http.Error(w, "Meta rejected the change: "+err.Error(), http.StatusUnprocessableEntity)
		return
	}
	detail := fmt.Sprintf("Updated ad set %s settings by %s", adsetID, a.Name)
	if b.DailyBudget != nil {
		detail += fmt.Sprintf(" (daily budget Rp %d)", *b.DailyBudget)
	}
	s.logAdsManage(r.Context(), a, t, "updated_adset_settings", "adset", adsetID, detail)
	writeJSON(w, map[string]any{"ok": true})
}

// DELETE /api/campaigns/{id}/ads/ad/{entityId} — removes the ad on Meta
// (irreversible there); the Simpulx creative row is unlinked, not deleted, so a
// relaunch can recreate the ad without re-uploading the asset.
func (s *server) handleAdsAdDelete(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	t, msg, code := s.resolveAdsTarget(r.Context(), a.OrgID, r.PathValue("id"))
	if msg != "" {
		http.Error(w, msg, code)
		return
	}
	adID := r.PathValue("entityId")
	if _, msg, code := s.verifyAdsEntity(r.Context(), t, "ad", adID); msg != "" {
		http.Error(w, msg, code)
		return
	}
	if err := metaDelete(r.Context(), adID, t.token); err != nil {
		http.Error(w, "Meta rejected the change: "+err.Error(), http.StatusUnprocessableEntity)
		return
	}
	// Carousel rows all share one meta_ad_id, so this unlinks every member row —
	// correct: the next Launch rebuilds the carousel ad. meta_image_hash stays,
	// so nothing is re-uploaded.
	_, _ = s.pool.Exec(r.Context(),
		`UPDATE campaign_creatives SET meta_ad_id = NULL, status = 'uploaded'
		  WHERE campaign_id = $1::uuid AND organization_id = $2::uuid AND meta_ad_id = $3`,
		t.campaignID, t.orgID, adID)
	s.logAdsManage(r.Context(), a, t, "deleted_ad", "ad", adID,
		fmt.Sprintf("Deleted ad %s on Meta by %s", adID, a.Name))
	writeJSON(w, map[string]any{"deleted": true, "id": adID})
}
