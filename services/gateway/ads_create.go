package main

// The launch CREATE step: everything 0109's prerequisites were building toward.
// Takes the settled inputs (geo choices, approved copy, uploaded creatives, the
// chosen Facebook Page) and assembles real Meta objects — campaign, ad set, one
// ad per creative — every one of them PAUSED. Nothing spends until a human
// reviews it in Ads Manager and turns it on; "Launch" here means "hand Meta a
// finished draft", never "start spending".
//
// Every Meta id is persisted the moment it exists (campaigns.meta_campaign_id,
// meta_adset_id, campaign_creatives.meta_ad_id), so a failure halfway is
// resumable: a retry skips what was already created instead of duplicating it.

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// ── Facebook Page selection ─────────────────────────────────────────────────

// GET /api/campaigns/{id}/ads/pages — Pages the connected token can publish as.
// A CTWA ad runs "as" a Page (and that Page must have WhatsApp connected), so
// the human picks one here rather than us guessing from the account.
func (s *server) handleListAdPages(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	campaignID := r.PathValue("id")

	t, msg, code := s.resolveAdsTarget(r.Context(), a.OrgID, campaignID)
	if msg != "" {
		http.Error(w, msg, code)
		return
	}

	var payload struct {
		Data []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"data"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	u := fmt.Sprintf("https://graph.facebook.com/%s/me/accounts?fields=id,name&limit=100&access_token=%s",
		metaGraphVersion, url.QueryEscape(t.token))
	if err := metaGet(r.Context(), u, &payload); err != nil {
		http.Error(w, "could not list Pages: "+err.Error(), http.StatusUnprocessableEntity)
		return
	}
	if payload.Error != nil {
		http.Error(w, "Meta refused to list Pages: "+payload.Error.Message, http.StatusUnprocessableEntity)
		return
	}

	var chosenID, chosenName string
	_ = s.pool.QueryRow(r.Context(),
		`SELECT COALESCE(meta_page_id,''), COALESCE(meta_page_name,'') FROM campaigns WHERE id=$1::uuid`,
		campaignID).Scan(&chosenID, &chosenName)

	pages := make([]map[string]string, 0, len(payload.Data))
	for _, p := range payload.Data {
		pages = append(pages, map[string]string{"id": p.ID, "name": p.Name})
	}
	writeJSON(w, map[string]any{
		"pages":  pages,
		"chosen": map[string]string{"id": chosenID, "name": chosenName},
	})
}

// POST /api/campaigns/{id}/ads/page — record the chosen Page for this campaign.
func (s *server) handleChooseAdPage(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var b struct {
		PageID   string `json:"page_id"`
		PageName string `json:"page_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil || strings.TrimSpace(b.PageID) == "" {
		http.Error(w, "page_id required", http.StatusBadRequest)
		return
	}
	tag, err := s.pool.Exec(r.Context(),
		`UPDATE campaigns SET meta_page_id=$3, meta_page_name=$4
		  WHERE id=$1::uuid AND organization_id=$2`,
		r.PathValue("id"), a.OrgID, strings.TrimSpace(b.PageID), strings.TrimSpace(b.PageName))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	s.audit(r.Context(), a, "chose", "ad_page", r.PathValue("id"), map[string]any{"page_id": b.PageID, "page_name": b.PageName})
	writeJSON(w, map[string]any{"ok": true})
}

// ── Meta write helpers ──────────────────────────────────────────────────────

// metaPostID posts a form and returns the created object's id. metaPostForm
// only reports success/failure; object creation needs the id back.
func metaPostID(ctx context.Context, u string, form url.Values) (string, error) {
	reqCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, u, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := adHTTP.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var out struct {
		ID    string `json:"id"`
		Error *struct {
			Message      string `json:"message"`
			UserTitle    string `json:"error_user_title"`
			UserMsg      string `json:"error_user_msg"`
			Type         string `json:"type"`
			Code         int    `json:"code"`
			ErrorSubcode int    `json:"error_subcode"`
		} `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil && resp.StatusCode/100 == 2 {
		return "", fmt.Errorf("meta: unreadable response: %w", err)
	}
	if out.Error != nil {
		// error_user_msg is Meta's human-written explanation ("Your budget is too
		// low..."); when present it beats the generic message for the operator.
		m := out.Error.Message
		if out.Error.UserMsg != "" {
			m = out.Error.UserTitle + ": " + out.Error.UserMsg
		}
		return "", fmt.Errorf("meta %s (%d/%d): %s", out.Error.Type, out.Error.Code, out.Error.ErrorSubcode, m)
	}
	if out.ID == "" {
		return "", fmt.Errorf("meta returned no id (http %d)", resp.StatusCode)
	}
	return out.ID, nil
}

// metaUploadImage pushes image bytes to /adimages and returns the image hash.
// Its response shape is unlike every other create endpoint.
func metaUploadImage(ctx context.Context, actID, token string, img []byte) (string, error) {
	form := url.Values{}
	form.Set("bytes", base64.StdEncoding.EncodeToString(img))
	form.Set("access_token", token)
	reqCtx, cancel := context.WithTimeout(ctx, 120*time.Second)
	defer cancel()
	u := fmt.Sprintf("https://graph.facebook.com/%s/act_%s/adimages", metaGraphVersion, actID)
	req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, u, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := adHTTP.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var out struct {
		Images map[string]struct {
			Hash string `json:"hash"`
		} `json:"images"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", fmt.Errorf("adimages: unreadable response: %w", err)
	}
	if out.Error != nil {
		return "", fmt.Errorf("adimages: %s", out.Error.Message)
	}
	for _, v := range out.Images { // keyed by upload name; with `bytes` there is exactly one
		if v.Hash != "" {
			return v.Hash, nil
		}
	}
	return "", fmt.Errorf("adimages: no hash in response")
}

// metaVideoThumbnail polls a freshly uploaded video for a generated thumbnail.
// video_data requires one, and Meta generates them asynchronously — usually
// within seconds, so a short bounded poll covers the common case.
func metaVideoThumbnail(ctx context.Context, videoID, token string) (string, error) {
	u := fmt.Sprintf("https://graph.facebook.com/%s/%s/thumbnails?access_token=%s",
		metaGraphVersion, videoID, url.QueryEscape(token))
	for i := 0; i < 6; i++ {
		var out struct {
			Data []struct {
				URI         string `json:"uri"`
				IsPreferred bool   `json:"is_preferred"`
			} `json:"data"`
		}
		if err := metaGet(ctx, u, &out); err == nil && len(out.Data) > 0 {
			for _, d := range out.Data {
				if d.IsPreferred {
					return d.URI, nil
				}
			}
			return out.Data[0].URI, nil
		}
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-time.After(3 * time.Second):
		}
	}
	return "", fmt.Errorf("no thumbnail generated yet — try Launch again in a minute")
}

// fetchCreativeBytes loads a stored creative. MinIO objects are public, but the
// gateway fetches over HTTP through the same URL the browser uses so the code
// has one path that provably works.
func fetchCreativeBytes(ctx context.Context, fileURL string) ([]byte, error) {
	reqCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, fileURL, nil)
	if err != nil {
		return nil, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("fetch creative: http %d", resp.StatusCode)
	}
	return io.ReadAll(io.LimitReader(resp.Body, 110<<20))
}

// ── Launch ──────────────────────────────────────────────────────────────────

// POST /api/campaigns/{id}/ads/launch
func (s *server) handleLaunchAds(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	campaignID := r.PathValue("id")
	ctx := r.Context()

	t, msg, code := s.resolveAdsTarget(ctx, a.OrgID, campaignID)
	if msg != "" {
		http.Error(w, msg, code)
		return
	}

	// ── Load the settled inputs ──
	var (
		monthlyBudget               *float64
		cities                      []string
		ageMin, ageMax              int
		gender                      string
		advantage                   bool
		pageID, pageName            string
		metaCampaignID, metaAdsetID string
	)
	if err := s.pool.QueryRow(ctx,
		`SELECT monthly_budget, COALESCE(covered_cities,'{}'), target_age_min, target_age_max,
		        target_gender, advantage_audience_enabled,
		        COALESCE(meta_page_id,''), COALESCE(meta_page_name,''),
		        COALESCE(meta_campaign_id,''), COALESCE(meta_adset_id,'')
		   FROM campaigns WHERE id=$1::uuid AND organization_id=$2`,
		campaignID, a.OrgID).Scan(&monthlyBudget, &cities, &ageMin, &ageMax,
		&gender, &advantage, &pageID, &pageName, &metaCampaignID, &metaAdsetID); err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	type geoRow struct{ query, key, typ, name string }
	var geo []geoRow
	rows, err := s.pool.Query(ctx,
		`SELECT query, meta_key, COALESCE(meta_type,''), COALESCE(display_name,'')
		   FROM campaign_geo_targets WHERE campaign_id=$1::uuid ORDER BY query`, campaignID)
	if err == nil {
		for rows.Next() {
			var g geoRow
			if rows.Scan(&g.query, &g.key, &g.typ, &g.name) == nil {
				geo = append(geo, g)
			}
		}
		rows.Close()
	}

	var primaryTexts, headlines, descriptions []string
	{
		var pt, hl, ds []byte
		if err := s.pool.QueryRow(ctx,
			`SELECT primary_texts, headlines, descriptions
			   FROM campaign_ad_copy WHERE campaign_id=$1::uuid AND status='approved' LIMIT 1`,
			campaignID).Scan(&pt, &hl, &ds); err == nil {
			_ = json.Unmarshal(pt, &primaryTexts)
			_ = json.Unmarshal(hl, &headlines)
			_ = json.Unmarshal(ds, &descriptions)
		}
	}

	type creativeRow struct {
		id, fileURL, mediaType, fileName, imageHash, videoID, metaAdID string
	}
	var creatives []creativeRow
	rows, err = s.pool.Query(ctx,
		`SELECT id::text, file_url, media_type, COALESCE(file_name,''),
		        COALESCE(meta_image_hash,''), COALESCE(meta_video_id,''), COALESCE(meta_ad_id,'')
		   FROM campaign_creatives WHERE campaign_id=$1::uuid ORDER BY created_at`, campaignID)
	if err == nil {
		for rows.Next() {
			var c creativeRow
			if rows.Scan(&c.id, &c.fileURL, &c.mediaType, &c.fileName, &c.imageHash, &c.videoID, &c.metaAdID) == nil {
				creatives = append(creatives, c)
			}
		}
		rows.Close()
	}

	// ── Re-check the blockers server-side. The preview's list is advisory for
	// the UI; THIS one is the gate. Same wording, so the user never sees a
	// launch fail for a reason the preview did not show. Keep in sync with
	// handleCampaignAdsPreview. ──
	var blockers []string
	if len(cities) == 0 {
		blockers = append(blockers, "No service area set. Add the cities this campaign serves.")
	}
	if monthlyBudget == nil || *monthlyBudget <= 0 {
		blockers = append(blockers, "No monthly budget set.")
	}
	if len(geo) < len(cities) {
		blockers = append(blockers, fmt.Sprintf(
			"%d of %d cities are not matched to a Meta location yet. Confirm them so the budget cannot land in the wrong province.",
			len(cities)-len(geo), len(cities)))
	}
	if len(primaryTexts) == 0 && len(headlines) == 0 {
		blockers = append(blockers, "No approved ad copy. Generate it, read it, then approve.")
	}
	if len(creatives) == 0 {
		blockers = append(blockers, "No creative uploaded. Add at least one product photo or video.")
	}
	if pageID == "" {
		blockers = append(blockers, "No Facebook Page chosen. Pick the Page the ad runs as (it must have WhatsApp connected).")
	}
	if len(blockers) > 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		_ = json.NewEncoder(w).Encode(map[string]any{"blockers": blockers})
		return
	}

	launched := metaAdsetID != ""
	if launched {
		for _, c := range creatives {
			if c.metaAdID == "" {
				launched = false // resume: finish the missing ads
				break
			}
		}
	}
	if launched {
		http.Error(w, "already launched: the Meta campaign exists. Manage it from the Ads tab or Ads Manager.", http.StatusConflict)
		return
	}

	// A failure at any step records WHERE it failed, sets ads_status='error',
	// and leaves the ids created so far in place — retry resumes, not restarts.
	fail := func(step string, err error) {
		_, _ = s.pool.Exec(context.Background(),
			`UPDATE campaigns SET ads_status='error', ads_last_error=$2 WHERE id=$1::uuid`,
			campaignID, step+": "+err.Error())
		http.Error(w, "Meta refused at "+step+": "+err.Error(), http.StatusUnprocessableEntity)
	}
	base := fmt.Sprintf("https://graph.facebook.com/%s/act_%s", metaGraphVersion, t.extAccountID)

	// ── 1. Campaign (PAUSED) ──
	if metaCampaignID == "" {
		form := url.Values{}
		form.Set("name", t.campaignName+" (Simpulx)")
		// CTWA: engagement objective with a WhatsApp destination on the ad set.
		form.Set("objective", "OUTCOME_ENGAGEMENT")
		form.Set("status", "PAUSED")
		form.Set("special_ad_categories", "[]")
		// Wajib eksplisit sejak rollout Advantage campaign budget: tanpa field ini
		// Meta menolak dengan (100/4834011). false = budget diatur per ad set.
		form.Set("is_adset_budget_sharing_enabled", "false")
		form.Set("access_token", t.token)
		id, err := metaPostID(ctx, base+"/campaigns", form)
		if err != nil {
			fail("create campaign", err)
			return
		}
		metaCampaignID = id
		_, _ = s.pool.Exec(ctx,
			`UPDATE campaigns SET meta_campaign_id=$2, ads_status='draft', ads_last_error=NULL WHERE id=$1::uuid`,
			campaignID, id)

		// Register it in the sync tables NOW, mapped to this campaign: the metrics
		// cron and CTWA lead routing key off this mapping, so ads created through
		// us are tracked from the first impression with no manual mapping step.
		var adCampaignUUID string
		if err := s.pool.QueryRow(ctx,
			`INSERT INTO ad_campaigns (organization_id, ad_account_id, platform, external_id, name, campaign_id)
			 VALUES ($1::uuid,$2::uuid,'meta',$3,$4,$5::uuid)
			 ON CONFLICT (ad_account_id, external_id)
			 DO UPDATE SET name=EXCLUDED.name, campaign_id=EXCLUDED.campaign_id
			 RETURNING id::text`,
			a.OrgID, t.accountID, id, t.campaignName+" (Simpulx)", campaignID).Scan(&adCampaignUUID); err == nil {
			_, _ = s.pool.Exec(ctx,
				`INSERT INTO ad_campaign_campaigns (ad_campaign_id, campaign_id, organization_id)
				 VALUES ($1::uuid,$2::uuid,$3::uuid) ON CONFLICT DO NOTHING`,
				adCampaignUUID, campaignID, a.OrgID)
		}
	}

	// ── 2. Ad set (PAUSED, WhatsApp destination) ──
	if metaAdsetID == "" {
		geoLoc := map[string][]map[string]string{}
		bucket := map[string]string{"city": "cities", "subcity": "subcities", "region": "regions", "neighborhood": "neighborhoods"}
		for _, g := range geo {
			f, ok := bucket[strings.ToLower(g.typ)]
			if !ok {
				f = "cities"
			}
			geoLoc[f] = append(geoLoc[f], map[string]string{"key": g.key})
		}
		targeting := map[string]any{
			"geo_locations": geoLoc,
			"age_min":       ageMin,
		}
		switch gender {
		case "male":
			targeting["genders"] = []int{1}
		case "female":
			targeting["genders"] = []int{2}
		}
		if advantage {
			// Advantage+ audience: age_max menjadi HARD control dan Meta menolak
			// nilai < 65 dengan (100/1870189) -- batas atas hanya boleh jadi
			// "saran", bukan control. Jadi dengan Advantage+ aktif age_max tidak
			// dikirim; age_min tetap sah sebagai control.
			targeting["targeting_automation"] = map[string]int{"advantage_audience": 1}
		} else if ageMax > 0 {
			targeting["age_max"] = ageMax
		}

		buildForm := func(tgt map[string]any) url.Values {
			tj, _ := json.Marshal(tgt)
			po, _ := json.Marshal(map[string]string{"page_id": pageID})
			form := url.Values{}
			form.Set("name", t.campaignName+" - Ad Set")
			form.Set("campaign_id", metaCampaignID)
			// IDR is an offset-1 currency in Meta's table: budgets are whole rupiah,
			// NOT cents. (Offset-100 here would 100x the budget.)
			form.Set("daily_budget", strconv.Itoa(int(*monthlyBudget/30.0)))
			form.Set("billing_event", "IMPRESSIONS")
			form.Set("optimization_goal", "CONVERSATIONS")
			form.Set("bid_strategy", "LOWEST_COST_WITHOUT_CAP")
			form.Set("destination_type", "WHATSAPP")
			form.Set("promoted_object", string(po))
			form.Set("targeting", string(tj))
			form.Set("status", "PAUSED")
			form.Set("access_token", t.token)
			return form
		}
		id, err := metaPostID(ctx, base+"/adsets", buildForm(targeting))
		if err != nil && strings.Contains(strings.ToLower(err.Error()), "subcit") {
			// Defensive: if this Graph version rejects the "subcities" bucket, fold
			// those keys into "cities" and try once more.
			folded := map[string][]map[string]string{}
			for f, ks := range geoLoc {
				if f == "subcities" {
					f = "cities"
				}
				folded[f] = append(folded[f], ks...)
			}
			targeting["geo_locations"] = folded
			id, err = metaPostID(ctx, base+"/adsets", buildForm(targeting))
		}
		if err != nil {
			fail("create ad set", err)
			return
		}
		metaAdsetID = id
		_, _ = s.pool.Exec(ctx,
			`UPDATE campaigns SET meta_adset_id=$2, ads_last_error=NULL WHERE id=$1::uuid`, campaignID, id)
	}

	// ── 3. One ad per creative (PAUSED) ──
	first := func(xs []string) string {
		if len(xs) > 0 {
			return xs[0]
		}
		return ""
	}
	message, headline, desc := first(primaryTexts), first(headlines), first(descriptions)

	type adResult struct {
		CreativeID string `json:"creative_id"`
		FileName   string `json:"file_name"`
		MetaAdID   string `json:"meta_ad_id,omitempty"`
		Error      string `json:"error,omitempty"`
	}
	var results []adResult
	created := 0
	for _, c := range creatives {
		res := adResult{CreativeID: c.id, FileName: c.fileName}
		if c.metaAdID != "" { // resume: already done in a previous attempt
			res.MetaAdID = c.metaAdID
			results = append(results, res)
			created++
			continue
		}

		// 3a. Get the asset onto Meta.
		storySpec := map[string]any{"page_id": pageID}
		cta := map[string]any{"type": "WHATSAPP_MESSAGE", "value": map[string]string{"app_destination": "WHATSAPP"}}
		switch c.mediaType {
		case "image":
			if c.imageHash == "" {
				img, err := fetchCreativeBytes(ctx, c.fileURL)
				if err == nil {
					c.imageHash, err = metaUploadImage(ctx, t.extAccountID, t.token, img)
				}
				if err != nil {
					res.Error = "upload image: " + err.Error()
					results = append(results, res)
					continue
				}
				_, _ = s.pool.Exec(ctx,
					`UPDATE campaign_creatives SET meta_image_hash=$2 WHERE id=$1::uuid`, c.id, c.imageHash)
			}
			storySpec["link_data"] = map[string]any{
				"message":        message,
				"name":           headline,
				"description":    desc,
				"link":           "https://api.whatsapp.com/send",
				"image_hash":     c.imageHash,
				"call_to_action": cta,
			}
		case "video":
			if c.videoID == "" {
				form := url.Values{}
				form.Set("file_url", c.fileURL) // MinIO objects are public; Meta pulls the file itself
				form.Set("access_token", t.token)
				vid, err := metaPostID(ctx, base+"/advideos", form)
				if err != nil {
					res.Error = "upload video: " + err.Error()
					results = append(results, res)
					continue
				}
				c.videoID = vid
				_, _ = s.pool.Exec(ctx,
					`UPDATE campaign_creatives SET meta_video_id=$2 WHERE id=$1::uuid`, c.id, vid)
			}
			thumb, err := metaVideoThumbnail(ctx, c.videoID, t.token)
			if err != nil {
				res.Error = "video thumbnail: " + err.Error()
				results = append(results, res)
				continue
			}
			storySpec["video_data"] = map[string]any{
				"video_id":       c.videoID,
				"message":        message,
				"title":          headline,
				"image_url":      thumb,
				"call_to_action": cta,
			}
		default:
			res.Error = "unsupported media type " + c.mediaType
			results = append(results, res)
			continue
		}

		// 3b. Creative, then the ad itself.
		ss, _ := json.Marshal(storySpec)
		form := url.Values{}
		form.Set("name", t.campaignName+" - "+c.fileName)
		form.Set("object_story_spec", string(ss))
		form.Set("access_token", t.token)
		creativeID, err := metaPostID(ctx, base+"/adcreatives", form)
		if err != nil {
			res.Error = "create creative: " + err.Error()
			results = append(results, res)
			continue
		}

		form = url.Values{}
		form.Set("name", t.campaignName+" - "+c.fileName)
		form.Set("adset_id", metaAdsetID)
		form.Set("creative", `{"creative_id":"`+creativeID+`"}`)
		form.Set("status", "PAUSED")
		form.Set("access_token", t.token)
		adID, err := metaPostID(ctx, base+"/ads", form)
		if err != nil {
			res.Error = "create ad: " + err.Error()
			results = append(results, res)
			continue
		}
		res.MetaAdID = adID
		created++
		_, _ = s.pool.Exec(ctx,
			`UPDATE campaign_creatives SET meta_ad_id=$2, status='paused' WHERE id=$1::uuid`, c.id, adID)
		results = append(results, res)
	}

	if created == 0 {
		// Campaign + ad set exist but not a single ad made it: that is a failed
		// launch, and ads_status must say so rather than pretending.
		firstErr := "no ad could be created"
		for _, r2 := range results {
			if r2.Error != "" {
				firstErr = r2.Error
				break
			}
		}
		fail("create ads", fmt.Errorf("%s", firstErr))
		return
	}

	_, _ = s.pool.Exec(ctx,
		`UPDATE campaigns SET ads_status='paused', ads_last_error=NULL,
		        ads_launched_at=now(), ads_launched_by=$2::uuid WHERE id=$1::uuid`,
		campaignID, a.UserID)
	detail := fmt.Sprintf("Launched by %s: campaign %s, ad set %s, %d/%d ad(s) created, all PAUSED",
		a.Name, metaCampaignID, metaAdsetID, created, len(creatives))
	_, _ = s.pool.Exec(ctx,
		`INSERT INTO ads_alerts (organization_id, campaign_id, alert_type, action_taken, detail, notified_at)
		 VALUES ($1::uuid, $2::uuid, 'launch', 'created_paused', $3, now())`,
		t.orgID, campaignID, detail)
	s.audit(ctx, a, "launched", "campaign_ads", campaignID, map[string]any{
		"meta_campaign_id": metaCampaignID, "meta_adset_id": metaAdsetID,
		"ads_created": created, "creatives": len(creatives),
	})

	writeJSON(w, map[string]any{
		"meta_campaign_id": metaCampaignID,
		"meta_adset_id":    metaAdsetID,
		"ads":              results,
		"created":          created,
		"status":           "paused",
	})
}

// checkAdAccountOwned verifies an ad-account id belongs to the org before it is
// written anywhere: the FK alone would happily accept another tenant's account.
// Empty / "none" (keep / detach markers) pass through untouched.
func (s *server) checkAdAccountOwned(ctx context.Context, orgID, adAccountID string) (msg string, code int) {
	if adAccountID == "" || adAccountID == "none" {
		return "", 0
	}
	var ok bool
	if err := s.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM ad_accounts WHERE id=$1::uuid AND organization_id=$2)`,
		adAccountID, orgID).Scan(&ok); err != nil || !ok {
		return "ad account not found", http.StatusNotFound
	}
	return "", 0
}

// POST /api/campaigns/{id}/ads/account — attach a connected ad account to this
// campaign (campaigns.managed_ad_account_id). A freshly created campaign has no
// Meta campaign to map yet, so the mapping dialog cannot be the only way to an
// account: this is the step that gives Launch an account to create into.
func (s *server) handleSetCampaignAdAccount(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var b struct {
		AdAccountID string `json:"ad_account_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil || strings.TrimSpace(b.AdAccountID) == "" {
		http.Error(w, "ad_account_id required", http.StatusBadRequest)
		return
	}
	if msg, code := s.checkAdAccountOwned(r.Context(), a.OrgID, b.AdAccountID); msg != "" {
		http.Error(w, msg, code)
		return
	}
	tag, err := s.pool.Exec(r.Context(),
		`UPDATE campaigns SET managed_ad_account_id=$3::uuid WHERE id=$1::uuid AND organization_id=$2`,
		r.PathValue("id"), a.OrgID, b.AdAccountID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	s.audit(r.Context(), a, "attached", "campaign_ad_account", r.PathValue("id"), map[string]any{"ad_account_id": b.AdAccountID})
	writeJSON(w, map[string]any{"ok": true})
}
