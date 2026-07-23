package main

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// ── Ads control (write) ─────────────────────────────────────────────────────
//
// Everything before this file only READ from Meta. These endpoints let the
// dashboard stop and restart delivery, which means they spend or stop spending a
// customer's money, so each one resolves the campaign's ad account and checks
// what the client agreed to (ad_accounts.access_mode, migration 0112) before
// touching Meta at all. A 'read' account is refused here regardless of what the
// token would technically allow: the token says what is possible, access_mode
// says what was agreed, and the narrower wins.
//
// Deliberately NOT here: create/launch. That is a bigger surface (copy, audience,
// creative upload, geo resolution) and belongs in its own pass; these four are
// the controls for ads that already exist.

// adsTarget is everything needed to act on one campaign's ads.
type adsTarget struct {
	campaignID   string
	campaignName string
	orgID        string
	accountID    string // ad_accounts.id — needed when launch registers the created Meta campaign
	extAccountID string
	token        string
	accessMode   string
	metaCampaign string // campaigns.meta_campaign_id, set when WE created it
}

// resolveAdsTarget is resolveAdsAny plus the manage-mode requirement. Every
// WRITE path (pause/resume/launch) goes through this one; read-only surfaces
// (live status, creative previews) use resolveAdsAny, because reporting is what
// a "read" account explicitly agreed to.
func (s *server) resolveAdsTarget(ctx context.Context, orgID, campaignID string) (adsTarget, string, int) {
	t, msg, code := s.resolveAdsAny(ctx, orgID, campaignID)
	if msg != "" {
		return t, msg, code
	}
	if t.accessMode != "manage" {
		return t, "this ad account is connected for reporting only. Switch it to \"Manage ads\" in Channel & Integrations first.", http.StatusForbidden
	}
	return t, "", 0
}

// resolveAdsAny loads the campaign's ad account (either link path) and decrypts
// its token, without requiring manage mode.
// Returns a caller-safe message on failure: these strings surface in the UI, so
// they say what to fix rather than leaking internals.
func (s *server) resolveAdsAny(ctx context.Context, orgID, campaignID string) (adsTarget, string, int) {
	var t adsTarget
	var encToken string
	// The account is resolved through EITHER link, in priority order: the explicit
	// managed_ad_account_id when set, else the account of whatever Meta campaign is
	// MAPPED to this campaign. Requiring the explicit column alone made the Ads tab
	// claim "no ad account" for a campaign whose Meta campaign was plainly mapped —
	// the mapping already names an account, and asking the user to say it twice is
	// how the two answers drift apart.
	err := s.pool.QueryRow(ctx,
		`SELECT c.id::text, c.name, c.organization_id::text, aa.account_id::text,
		        aa.external_account_id, COALESCE(aa.access_token,''), aa.access_mode,
		        COALESCE(c.meta_campaign_id,'')
		   FROM campaigns c
		   JOIN LATERAL (
		     SELECT a1.id AS account_id, a1.external_account_id, a1.access_token, a1.access_mode, 0 AS prio
		       FROM ad_accounts a1 WHERE a1.id = c.managed_ad_account_id
		     UNION ALL
		     SELECT a2.id, a2.external_account_id, a2.access_token, a2.access_mode, 1
		       FROM ad_campaign_campaigns m
		       JOIN ad_campaigns ac ON ac.id = m.ad_campaign_id
		       JOIN ad_accounts a2 ON a2.id = ac.ad_account_id
		      WHERE m.campaign_id = c.id
		      ORDER BY prio LIMIT 1
		   ) aa ON true
		  WHERE c.id = $1::uuid AND c.organization_id = $2`,
		campaignID, orgID).Scan(&t.campaignID, &t.campaignName, &t.orgID, &t.accountID,
		&t.extAccountID, &encToken, &t.accessMode, &t.metaCampaign)
	if err != nil {
		return t, "this campaign has no ad account connected for ads management", http.StatusConflict
	}
	tok, err := decryptAdToken(encToken)
	if err != nil || tok == "" {
		return t, "the ad account has no usable access token", http.StatusConflict
	}
	t.token = tok
	return t, "", 0
}

// adObjectIDs returns the Meta objects a pause/resume should apply to.
//
// Prefers the campaign we created ourselves (meta_campaign_id). Falls back to the
// mapped ad campaigns, which is what makes these controls useful for accounts
// where the ads were built in Ads Manager and only linked to us afterwards --
// the common case today, since nothing has been created through Simpulx yet.
func (s *server) adObjectIDs(ctx context.Context, t adsTarget) ([]string, error) {
	if t.metaCampaign != "" {
		return []string{t.metaCampaign}, nil
	}
	rows, err := s.pool.Query(ctx,
		`SELECT ac.external_id
		   FROM ad_campaign_campaigns m
		   JOIN ad_campaigns ac ON ac.id = m.ad_campaign_id
		  WHERE m.campaign_id = $1::uuid AND ac.platform = 'meta'`, t.campaignID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err == nil && id != "" {
			out = append(out, id)
		}
	}
	return out, rows.Err()
}

// setAdsStatus is the shared body of pause and resume.
func (s *server) setAdsStatus(w http.ResponseWriter, r *http.Request, status string) {
	a, _ := authFrom(r.Context())
	campaignID := r.PathValue("id")

	t, msg, code := s.resolveAdsTarget(r.Context(), a.OrgID, campaignID)
	if msg != "" {
		http.Error(w, msg, code)
		return
	}
	ids, err := s.adObjectIDs(r.Context(), t)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if len(ids) == 0 {
		http.Error(w, "no Meta campaign is linked to this campaign yet", http.StatusConflict)
		return
	}

	// Apply to every linked object, but report per object rather than aborting on
	// the first failure: with several linked campaigns, a partial result is the
	// truth and hiding it would leave delivery running while the UI said paused.
	var failed []string
	applied := 0
	for _, id := range ids {
		if err := metaSetStatus(r.Context(), id, t.token, status); err != nil {
			s.log.Warn("ads control failed", "campaign", t.campaignName, "object", id, "status", status, "err", err)
			failed = append(failed, fmt.Sprintf("%s: %v", id, err))
			continue
		}
		applied++
		// Pause is asymmetric on Meta: pausing the campaign stops everything under
		// it, but resuming the campaign only clears the CAMPAIGN-level pause — an
		// ad set or ad that is itself PAUSED stays off (and our own launch creates
		// all three levels PAUSED). Without this cascade, Resume reported success
		// while not a single ad delivered. Child failures are reported but do not
		// count against `applied`, which tallies campaign-level flips.
		if status == "ACTIVE" {
			failed = append(failed, resumeChildren(r.Context(), id, t.token)...)
		}
	}
	// Record it in the same log the monitor writes to, so an operator sees manual
	// and automatic actions on one timeline instead of two.
	action := "paused_campaign"
	if status == "ACTIVE" {
		action = "resumed_campaign"
	}
	detail := fmt.Sprintf("Manual %s by %s (%d/%d Meta campaign(s))",
		strings.ToLower(strings.TrimSuffix(action, "_campaign")), a.Name, applied, len(ids))
	if len(failed) > 0 {
		detail += " - failed: " + strings.Join(failed, "; ")
	}
	_, _ = s.pool.Exec(r.Context(),
		`INSERT INTO ads_alerts (organization_id, campaign_id, alert_type, action_taken, detail, notified_at)
		 VALUES ($1::uuid, $2::uuid, 'manual_control', $3, $4, now())`,
		t.orgID, t.campaignID, action, detail)
	s.audit(r.Context(), a, action, "campaign", t.campaignID, map[string]any{
		"objects": ids, "applied": applied, "failed": len(failed),
	})

	if applied == 0 {
		http.Error(w, "Meta rejected the change: "+strings.Join(failed, "; "), http.StatusBadGateway)
		return
	}
	// Reflect the new state locally so the dashboard does not have to wait for the
	// next sync to stop showing the old one.
	newState := "paused"
	if status == "ACTIVE" {
		newState = "active"
	}
	_, _ = s.pool.Exec(r.Context(),
		`UPDATE campaigns SET ads_status=$2, updated_at=now() WHERE id=$1::uuid`, t.campaignID, newState)

	writeJSON(w, map[string]any{
		"status": newState, "applied": applied, "total": len(ids), "failed": failed,
	})
}

// POST /api/campaigns/{id}/ads/pause
func (s *server) handlePauseAds(w http.ResponseWriter, r *http.Request) {
	s.setAdsStatus(w, r, "PAUSED")
}

// POST /api/campaigns/{id}/ads/resume
func (s *server) handleResumeAds(w http.ResponseWriter, r *http.Request) {
	s.setAdsStatus(w, r, "ACTIVE")
}

// GET /api/campaigns/{id}/ads-metrics?from=&to=
//
// Daily rows for the campaign's linked ad campaigns. Derived metrics (CTR, CPC,
// CPL) are computed here rather than stored, so they can never disagree with the
// counts they come from.
func (s *server) handleCampaignAdsMetrics(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	from := r.URL.Query().Get("from")
	to := r.URL.Query().Get("to")
	if to == "" {
		to = time.Now().Format("2006-01-02")
	}
	if from == "" {
		from = time.Now().AddDate(0, 0, -30).Format("2006-01-02")
	}
	rows, err := s.queryMaps(r.Context(),
		`SELECT am.date,
		        sum(am.impressions)::bigint AS impressions,
		        sum(am.reach)::bigint       AS reach,
		        sum(am.clicks)::bigint      AS clicks,
		        sum(am.results)::bigint     AS leads,
		        sum(am.spend)::float8       AS spend,
		        -- Frequency is an average over people, so it cannot be summed
		        -- across ad campaigns; weight it by impressions instead.
		        CASE WHEN sum(am.impressions) > 0
		             THEN (sum(am.frequency * am.impressions) / sum(am.impressions))::float8
		             ELSE 0 END AS frequency,
		        CASE WHEN sum(am.impressions) > 0
		             THEN (sum(am.clicks)::numeric / sum(am.impressions))::float8
		             ELSE 0 END AS ctr,
		        CASE WHEN sum(am.clicks) > 0
		             THEN (sum(am.spend) / sum(am.clicks))::float8
		             ELSE 0 END AS cpc,
		        CASE WHEN sum(am.results) > 0
		             THEN (sum(am.spend) / sum(am.results))::float8
		             ELSE 0 END AS cpl
		   FROM ad_metrics am
		   JOIN ad_campaign_campaigns m ON m.ad_campaign_id = am.ad_campaign_id
		   JOIN campaigns c ON c.id = m.campaign_id
		  WHERE m.campaign_id = $1::uuid AND c.organization_id = $2
		    AND am.date >= $3::date AND am.date <= $4::date
		  GROUP BY am.date
		  ORDER BY am.date`,
		r.PathValue("id"), a.OrgID, from, to)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"rows": rows, "from": from, "to": to})
}

// GET /api/campaigns/{id}/ads-alerts
func (s *server) handleCampaignAdsAlerts(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	rows, err := s.queryMaps(r.Context(),
		`SELECT al.id::text AS id, al.alert_type, al.ad_external_id,
		        al.metric_value, al.threshold_value, al.action_taken, al.detail,
		        al.notified_at, al.created_at,
		        cr.title AS ad_title, cr.image_url AS ad_image
		   FROM ads_alerts al
		   LEFT JOIN ad_creatives cr
		          ON cr.organization_id = al.organization_id
		         AND cr.ad_external_id = al.ad_external_id
		  WHERE al.campaign_id = $1::uuid AND al.organization_id = $2
		  ORDER BY al.created_at DESC
		  LIMIT 100`,
		r.PathValue("id"), a.OrgID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

// GET /api/campaigns/{id}/ads-status — what the dashboard needs to decide which
// controls to show, in one call: is this campaign managed, what did the client
// agree to, and what is linked.
func (s *server) handleCampaignAdsStatus(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var accountName, accessMode, adsStatus, metaCampaign string
	var accountID *string
	// Same two-path resolution as resolveAdsTarget: explicit managed account first,
	// else the account of the mapped Meta campaign(s).
	err := s.pool.QueryRow(r.Context(),
		`SELECT aa.id, COALESCE(aa.name,''), COALESCE(aa.access_mode,''),
		        COALESCE(c.ads_status,''), COALESCE(c.meta_campaign_id,'')
		   FROM campaigns c
		   LEFT JOIN LATERAL (
		     SELECT a1.id::text AS id, a1.name, a1.access_mode, 0 AS prio
		       FROM ad_accounts a1 WHERE a1.id = c.managed_ad_account_id
		     UNION ALL
		     SELECT a2.id::text, a2.name, a2.access_mode, 1
		       FROM ad_campaign_campaigns m
		       JOIN ad_campaigns ac ON ac.id = m.ad_campaign_id
		       JOIN ad_accounts a2 ON a2.id = ac.ad_account_id
		      WHERE m.campaign_id = c.id
		      ORDER BY prio LIMIT 1
		   ) aa ON true
		  WHERE c.id = $1::uuid AND c.organization_id = $2`,
		r.PathValue("id"), a.OrgID).Scan(&accountID, &accountName, &accessMode, &adsStatus, &metaCampaign)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	var linked int
	_ = s.pool.QueryRow(r.Context(),
		`SELECT count(*) FROM ad_campaign_campaigns WHERE campaign_id=$1::uuid`,
		r.PathValue("id")).Scan(&linked)

	writeJSON(w, map[string]any{
		"managed":         accountID != nil,
		"account_name":    accountName,
		"access_mode":     accessMode,
		"can_control":     accountID != nil && accessMode == "manage" && (linked > 0 || metaCampaign != ""),
		"ads_status":      adsStatus,
		"linked_ad_count": linked,
	})
}

// GET /api/campaigns/{id}/ads/live — the linked ads as Meta sees them RIGHT NOW:
// per-ad delivery status and creative thumbnail, plus one derived overall status.
//
// This is what makes the pause/resume control honest. Showing both buttons at
// once forces the user to remember which state the ads are in; the button should
// reflect Meta's live state, not the last thing we happened to write. Works for
// "read" accounts too — seeing what runs is reporting, which they agreed to.
func (s *server) handleCampaignAdsLive(w http.ResponseWriter, r *http.Request) {
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

	type liveAd struct {
		ID        string `json:"id"`
		Name      string `json:"name"`
		Status    string `json:"status"`
		Thumbnail string `json:"thumbnail"`
		Image     string `json:"image"` // full-size creative image when Meta exposes one
	}
	// Non-nil ON PURPOSE: a nil slice marshals as JSON null, and the UI calling
	// live.ads.length on null is exactly the crash this fixes — it fired for
	// every campaign whose account had no ads yet.
	ads := []liveAd{}
	var firstErr string
	if len(ids) > 5 {
		ids = ids[:5] // one Graph call per linked Meta campaign; cap the fan-out
	}
	for _, cid := range ids {
		var payload struct {
			Data []struct {
				ID              string `json:"id"`
				Name            string `json:"name"`
				EffectiveStatus string `json:"effective_status"`
				Creative        *struct {
					ThumbnailURL string `json:"thumbnail_url"`
					ImageURL     string `json:"image_url"`
				} `json:"creative"`
			} `json:"data"`
			Error *struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		// 512px thumbnail: the default 64px crop made creatives unrecognizable.
		// image_url is the uncropped original when the creative has one. If Meta
		// rejects the richer expansion for any reason, retry once with the plain
		// shape that predates it — a smaller thumbnail beats an empty grid.
		fetch := func(fields string) error {
			payload.Data = nil
			payload.Error = nil
			u := fmt.Sprintf("https://graph.facebook.com/%s/%s/ads?fields=%s&limit=50&access_token=%s",
				metaGraphVersion, cid, fields, url.QueryEscape(t.token))
			if err := metaGet(r.Context(), u, &payload); err != nil {
				return err
			}
			if payload.Error != nil {
				return fmt.Errorf("%s", payload.Error.Message)
			}
			return nil
		}
		err := fetch("name,effective_status,creative.thumbnail_width(512).thumbnail_height(512){thumbnail_url,image_url}")
		if err != nil {
			s.log.Warn("ads live rich fetch failed, retrying plain", "campaign", cid, "err", err)
			err = fetch("name,effective_status,creative{thumbnail_url}")
		}
		if err != nil {
			if firstErr == "" {
				firstErr = err.Error()
			}
			continue
		}
		for _, ad := range payload.Data {
			if ad.EffectiveStatus == "DELETED" || ad.EffectiveStatus == "ARCHIVED" {
				continue
			}
			la := liveAd{ID: ad.ID, Name: ad.Name, Status: ad.EffectiveStatus}
			if ad.Creative != nil {
				la.Thumbnail = ad.Creative.ThumbnailURL
				la.Image = ad.Creative.ImageURL
			}
			ads = append(ads, la)
		}
	}

	// One overall status the toggle can key off: delivering if ANYTHING delivers.
	overall := ""
	for _, ad := range ads {
		if ad.Status == "ACTIVE" {
			overall = "active"
			break
		}
	}
	if overall == "" && len(ads) > 0 {
		overall = "paused"
		for _, ad := range ads {
			if ad.Status == "PENDING_REVIEW" || ad.Status == "IN_PROCESS" {
				overall = "pending_review"
				break
			}
		}
	}
	if firstErr != "" {
		// Surfaced in the response AND logged: a silent per-campaign fetch failure
		// here shows up as "creatives missing" in the UI with nothing to debug from.
		s.log.Warn("ads live fetch failed", "campaign", t.campaignName, "err", firstErr)
	}
	writeJSON(w, map[string]any{"status": overall, "ads": ads, "error": firstErr})
}

// resumeChildren activates the PAUSED ad sets and ads under one Meta campaign,
// returning per-object failure strings (empty = all good). Only objects whose
// CONFIGURED status is PAUSED are touched: effective pauses inherited from the
// campaign clear on their own, and anything else is not ours to flip.
func resumeChildren(ctx context.Context, campaignExtID, token string) []string {
	var failed []string
	for _, edge := range []string{"adsets", "ads"} {
		var payload struct {
			Data []struct {
				ID     string `json:"id"`
				Status string `json:"status"`
			} `json:"data"`
			Error *struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		u := fmt.Sprintf("https://graph.facebook.com/%s/%s/%s?fields=id,status&limit=100&access_token=%s",
			metaGraphVersion, campaignExtID, edge, url.QueryEscape(token))
		if err := metaGet(ctx, u, &payload); err != nil {
			failed = append(failed, edge+": "+err.Error())
			continue
		}
		if payload.Error != nil {
			failed = append(failed, edge+": "+payload.Error.Message)
			continue
		}
		for _, o := range payload.Data {
			if o.Status != "PAUSED" {
				continue
			}
			if err := metaSetStatus(ctx, o.ID, token, "ACTIVE"); err != nil {
				failed = append(failed, o.ID+": "+err.Error())
			}
		}
	}
	return failed
}

// GET /api/campaigns/{id}/ads/{adId}/preview — Meta's own rendered preview of
// one ad (iframe HTML), the same thing Ads Manager shows. A thumbnail crops the
// creative and drops the copy; the real preview is the only honest answer to
// "what does this ad actually look like".
func (s *server) handleAdPreviewHTML(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	t, msg, code := s.resolveAdsAny(r.Context(), a.OrgID, r.PathValue("id"))
	if msg != "" {
		http.Error(w, msg, code)
		return
	}
	var payload struct {
		Data []struct {
			Body string `json:"body"`
		} `json:"data"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	// Ownership is enforced by Meta: a foreign ad id under this account's token
	// simply errors.
	u := fmt.Sprintf("https://graph.facebook.com/%s/%s/previews?ad_format=MOBILE_FEED_STANDARD&access_token=%s",
		metaGraphVersion, r.PathValue("adId"), url.QueryEscape(t.token))
	if err := metaGet(r.Context(), u, &payload); err != nil {
		s.log.Warn("ad preview fetch failed", "ad", r.PathValue("adId"), "err", err)
		http.Error(w, "could not load the ad preview: "+err.Error(), http.StatusBadGateway)
		return
	}
	if payload.Error != nil {
		s.log.Warn("ad preview refused", "ad", r.PathValue("adId"), "err", payload.Error.Message)
		http.Error(w, "Meta refused the preview: "+payload.Error.Message, http.StatusBadGateway)
		return
	}
	if len(payload.Data) == 0 {
		http.Error(w, "Meta returned no preview for this ad", http.StatusNotFound)
		return
	}
	writeJSON(w, map[string]any{"html": payload.Data[0].Body})
}
