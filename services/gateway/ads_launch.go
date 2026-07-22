package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/simpulx/v2/libs/go/config"
)

// ── Launch prerequisites ────────────────────────────────────────────────────
//
// Everything a campaign needs BEFORE a Meta campaign can be created: where the
// ads should run (geo), what they should say (copy), and who should see them
// (audience). Each is generated or resolved on request and reviewed by a human;
// nothing here writes to Meta.
//
// The create step itself is deliberately separate. These pieces are verifiable on
// their own -- a geo lookup and a copy draft can be checked without spending a
// rupiah -- and shipping them first means the create step, when it lands, is
// assembling inputs that have already been seen to be correct.

// ── Geo resolution ──────────────────────────────────────────────────────────

type metaGeoCandidate struct {
	Key         string `json:"key"`
	Name        string `json:"name"`
	Type        string `json:"type"`
	Region      string `json:"region"`
	CountryCode string `json:"country_code"`
}

// metaGeoSearch asks Meta which places match a city name.
func metaGeoSearch(ctx context.Context, token, query, country string) ([]metaGeoCandidate, error) {
	q := url.Values{}
	q.Set("type", "adgeolocation")
	q.Set("q", query)
	// subcity is REQUIRED, not optional. Indonesia's kota administrasi are subcities
	// in Meta's taxonomy, not cities: with ["city","region"] alone, "Jakarta
	// Selatan" and "Tangerang Selatan" return ZERO matches (verified against the
	// live API), which would leave five of one campaign's nine cities permanently
	// unresolvable and Launch permanently blocked.
	q.Set("location_types", `["city","subcity","region"]`)
	q.Set("country_code", country)
	q.Set("limit", "25")
	q.Set("access_token", token)
	u := fmt.Sprintf("https://graph.facebook.com/%s/search?%s", metaGraphVersion, q.Encode())

	var payload struct {
		Data  []metaGeoCandidate `json:"data"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := metaGet(ctx, u, &payload); err != nil {
		return nil, err
	}
	if payload.Error != nil {
		return nil, fmt.Errorf("meta: %s", payload.Error.Message)
	}
	// Meta returns matches from other countries even with country_code set, and a
	// city in the wrong country is the most expensive kind of wrong match.
	out := payload.Data[:0]
	for _, c := range payload.Data {
		if c.CountryCode == "" || strings.EqualFold(c.CountryCode, country) {
			out = append(out, c)
		}
	}
	// Rank before returning. A search for "Jakarta Selatan" comes back with 22
	// matches, mostly neighbourhoods that merely contain "Selatan", and the one
	// the user means ("South Jakarta", a subcity) is not first. Making a human
	// hunt for it through an unsorted list is how the wrong one gets picked, which
	// is the exact failure this whole flow exists to prevent.
	rankGeo(out, query)
	return out, nil
}

// rankGeo sorts candidates so the intended place is at the top: closest name
// match first, then broader administrative units before neighbourhoods.
func rankGeo(cands []metaGeoCandidate, query string) {
	q := strings.ToLower(strings.TrimSpace(query))
	typeRank := map[string]int{"region": 0, "city": 1, "subcity": 1, "neighborhood": 3}
	score := func(c metaGeoCandidate) int {
		n := strings.ToLower(c.Name)
		switch {
		case n == q:
			return 0
		case strings.HasPrefix(n, q):
			return 1
		case strings.Contains(n, q):
			return 2
		default:
			// No name overlap at all: Meta returned it as a fuzzy match (a search
			// for "Bogor" also returns "Cibinong"), so it goes last.
			return 4
		}
	}
	sort.SliceStable(cands, func(i, j int) bool {
		si, sj := score(cands[i]), score(cands[j])
		if si != sj {
			return si < sj
		}
		ti, tj := typeRank[strings.ToLower(cands[i].Type)], typeRank[strings.ToLower(cands[j].Type)]
		return ti < tj
	})
}

// GET /api/campaigns/{id}/ads/geo — resolve covered_cities to Meta targeting keys.
//
// The ambiguity guard is the point of this endpoint. "Depok" is a city in Jawa
// Barat and a kecamatan in Sleman; picking the first match silently aims the
// budget at the wrong province and nothing ever errors. So a single match is
// auto-confirmed and anything else is returned UNRESOLVED with every candidate,
// for a human to settle once. A launch refuses while anything is unresolved.
func (s *server) handleCampaignAdsGeo(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	campaignID := r.PathValue("id")

	t, msg, code := s.resolveAdsTarget(r.Context(), a.OrgID, campaignID)
	if msg != "" {
		http.Error(w, msg, code)
		return
	}

	var cities []string
	if err := s.pool.QueryRow(r.Context(),
		`SELECT COALESCE(covered_cities, '{}') FROM campaigns WHERE id=$1::uuid`, campaignID).Scan(&cities); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if len(cities) == 0 {
		http.Error(w, "this campaign has no service area yet. Set the cities it serves first.", http.StatusConflict)
		return
	}

	country := config.Get("ADS_GEO_COUNTRY", "ID")
	type cityResult struct {
		Query      string             `json:"query"`
		Resolved   bool               `json:"resolved"`
		Chosen     *metaGeoCandidate  `json:"chosen,omitempty"`
		Candidates []metaGeoCandidate `json:"candidates,omitempty"`
		Error      string             `json:"error,omitempty"`
	}
	results := make([]cityResult, 0, len(cities))

	for _, raw := range cities {
		q := strings.ToLower(strings.TrimSpace(raw))
		if q == "" {
			continue
		}
		res := cityResult{Query: raw}

		// An answer already settled for THIS campaign wins: the choice belongs to
		// the campaign, not to whoever searched the name first (0110).
		var key, name, typ, region string
		if err := s.pool.QueryRow(r.Context(),
			`SELECT meta_key, COALESCE(display_name,''), COALESCE(meta_type,''), COALESCE(region,'')
			   FROM campaign_geo_targets WHERE campaign_id=$1::uuid AND query=$2`,
			campaignID, q).Scan(&key, &name, &typ, &region); err == nil {
			res.Resolved = true
			res.Chosen = &metaGeoCandidate{Key: key, Name: name, Type: typ, Region: region}
			results = append(results, res)
			continue
		}

		cands, err := s.cachedGeoSearch(r.Context(), t.token, q, country)
		if err != nil {
			res.Error = err.Error()
			results = append(results, res)
			continue
		}
		res.Candidates = cands
		// Auto-confirm ONLY on a single match. Anything else is a decision, and
		// making it silently is how the budget ends up in the wrong province.
		if len(cands) == 1 {
			c := cands[0]
			if _, err := s.pool.Exec(r.Context(),
				`INSERT INTO campaign_geo_targets (campaign_id, query, meta_key, meta_type, display_name, region)
				 VALUES ($1::uuid,$2,$3,$4,$5,$6)
				 ON CONFLICT (campaign_id, query) DO NOTHING`,
				campaignID, q, c.Key, c.Type, c.Name, c.Region); err == nil {
				res.Resolved = true
				res.Chosen = &c
			}
		}
		results = append(results, res)
	}

	pending := 0
	for _, r2 := range results {
		if !r2.Resolved {
			pending++
		}
	}
	writeJSON(w, map[string]any{"cities": results, "unresolved": pending})
}

// cachedGeoSearch reuses the org-agnostic search cache (0110): Meta's key for a
// place is the same for everyone, so only the CHOICE is per campaign.
func (s *server) cachedGeoSearch(ctx context.Context, token, q, country string) ([]metaGeoCandidate, error) {
	var raw []byte
	if err := s.pool.QueryRow(ctx,
		`SELECT candidates FROM meta_geo_targets
		  WHERE country_code=$1 AND query=$2 AND updated_at > now() - interval '30 days'`,
		country, q).Scan(&raw); err == nil && len(raw) > 2 {
		var cached []metaGeoCandidate
		if json.Unmarshal(raw, &cached) == nil && len(cached) > 0 {
			return cached, nil
		}
	}
	cands, err := metaGeoSearch(ctx, token, q, country)
	if err != nil {
		return nil, err
	}
	blob, _ := json.Marshal(cands)
	_, _ = s.pool.Exec(ctx,
		`INSERT INTO meta_geo_targets (country_code, query, candidates, updated_at)
		 VALUES ($1,$2,$3::jsonb,now())
		 ON CONFLICT (country_code, query)
		 DO UPDATE SET candidates=EXCLUDED.candidates, updated_at=now()`,
		country, q, string(blob))
	return cands, nil
}

// POST /api/campaigns/{id}/ads/geo — record the human's choice for one city.
func (s *server) handleCampaignAdsGeoChoose(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var b struct {
		Query    string `json:"query"`
		MetaKey  string `json:"meta_key"`
		MetaType string `json:"meta_type"`
		Name     string `json:"display_name"`
		Region   string `json:"region"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil || b.Query == "" || b.MetaKey == "" {
		http.Error(w, "query and meta_key required", http.StatusBadRequest)
		return
	}
	if _, err := s.pool.Exec(r.Context(),
		`INSERT INTO campaign_geo_targets (campaign_id, query, meta_key, meta_type, display_name, region, confirmed_by)
		 VALUES ($1::uuid,$2,$3,$4,$5,$6,$7::uuid)
		 ON CONFLICT (campaign_id, query)
		 DO UPDATE SET meta_key=EXCLUDED.meta_key, meta_type=EXCLUDED.meta_type,
		               display_name=EXCLUDED.display_name, region=EXCLUDED.region,
		               confirmed_by=EXCLUDED.confirmed_by, confirmed_at=now()`,
		r.PathValue("id"), strings.ToLower(strings.TrimSpace(b.Query)),
		b.MetaKey, b.MetaType, b.Name, b.Region, a.UserID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"ok": true})
}

// ── Copy + audience generation ──────────────────────────────────────────────

// POST /api/campaigns/{id}/ads/generate-copy
//
// Proxies to ai-agent rather than calling Anthropic from Go, so the spend lands
// in the same llm_usage ledger as every other model call. A second LLM path in
// the gateway would be invisible to it.
//
// Saved as a DRAFT. Nothing reaches Meta until a human approves it: generated
// copy is the client's public voice, and auto-publishing it would put words the
// business never read in front of its customers.
func (s *server) handleGenerateAdCopy(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	campaignID := r.PathValue("id")

	var out struct {
		Copy struct {
			PrimaryTexts []string `json:"primary_texts"`
			Headlines    []string `json:"headlines"`
			Descriptions []string `json:"descriptions"`
		} `json:"copy"`
	}
	if err := s.callAIAgent(r.Context(), "/ads/copy", map[string]string{
		"org_id": a.OrgID, "campaign_id": campaignID,
	}, &out); err != nil {
		http.Error(w, "could not generate copy: "+err.Error(), http.StatusBadGateway)
		return
	}
	if len(out.Copy.PrimaryTexts) == 0 && len(out.Copy.Headlines) == 0 {
		http.Error(w, "the model returned no usable copy. Check the campaign has a segment, brand or catalogue to work from.", http.StatusConflict)
		return
	}

	pt, _ := json.Marshal(out.Copy.PrimaryTexts)
	hl, _ := json.Marshal(out.Copy.Headlines)
	ds, _ := json.Marshal(out.Copy.Descriptions)
	var id string
	if err := s.pool.QueryRow(r.Context(),
		`INSERT INTO campaign_ad_copy (organization_id, campaign_id, primary_texts, headlines, descriptions, model)
		 VALUES ($1::uuid,$2::uuid,$3::jsonb,$4::jsonb,$5::jsonb,'sonnet')
		 RETURNING id::text`,
		a.OrgID, campaignID, string(pt), string(hl), string(ds)).Scan(&id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.audit(r.Context(), a, "generated", "ad_copy", id, nil)
	writeJSON(w, map[string]any{
		"id": id, "status": "draft",
		"primary_texts": out.Copy.PrimaryTexts,
		"headlines":     out.Copy.Headlines,
		"descriptions":  out.Copy.Descriptions,
	})
}

// POST /api/campaigns/{id}/ads/copy/{copyId}/approve
func (s *server) handleApproveAdCopy(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	tag, err := s.pool.Exec(r.Context(),
		`UPDATE campaign_ad_copy SET status='approved', approved_at=now(), approved_by=$3::uuid
		  WHERE id=$1::uuid AND campaign_id=$2::uuid AND status='draft'`,
		r.PathValue("copyId"), r.PathValue("id"), a.UserID)
	if err != nil {
		// A unique index allows only one approved set per campaign, so this is the
		// likely failure and it deserves a sentence rather than a constraint name.
		http.Error(w, "another copy set is already approved for this campaign. Supersede it first.", http.StatusConflict)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	s.audit(r.Context(), a, "approved", "ad_copy", r.PathValue("copyId"), nil)
	writeJSON(w, map[string]any{"status": "approved"})
}

// GET /api/campaigns/{id}/ads/copy — latest drafts + the approved set.
func (s *server) handleListAdCopy(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	rows, err := s.queryMaps(r.Context(),
		`SELECT id::text AS id, primary_texts, headlines, descriptions, status, model,
		        generated_at, approved_at
		   FROM campaign_ad_copy
		  WHERE campaign_id=$1::uuid AND organization_id=$2
		  ORDER BY generated_at DESC LIMIT 10`,
		r.PathValue("id"), a.OrgID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

// POST /api/campaigns/{id}/ads/suggest-audience — interest NAMES to review.
func (s *server) handleSuggestAdAudience(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var out struct {
		Audience struct {
			Interests []struct {
				Name string `json:"name"`
				Why  string `json:"why"`
			} `json:"interests"`
		} `json:"audience"`
	}
	if err := s.callAIAgent(r.Context(), "/ads/audience", map[string]string{
		"org_id": a.OrgID, "campaign_id": r.PathValue("id"),
	}, &out); err != nil {
		http.Error(w, "could not suggest an audience: "+err.Error(), http.StatusBadGateway)
		return
	}
	writeJSON(w, map[string]any{"interests": out.Audience.Interests})
}

// callAIAgent posts JSON to the intelligence service and decodes the reply.
func (s *server) callAIAgent(ctx context.Context, path string, body any, out any) error {
	raw, err := json.Marshal(body)
	if err != nil {
		return err
	}
	// Generous timeout: this is one model call, and failing early would waste the
	// tokens already spent without showing the user anything.
	reqCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, s.aiAgentURL+path, bytes.NewReader(raw))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		return fmt.Errorf("ai-agent returned %d", resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

// ── Pre-launch preview ──────────────────────────────────────────────────────

// GET /api/campaigns/{id}/ads/preview
//
// Everything that WOULD be sent to Meta, plus every reason it cannot go yet, in
// one call. This exists because the alternative is a Launch button that either
// fails halfway with a Meta error code, or succeeds and spends money on something
// nobody read. A campaign is the client's public voice and their budget; both
// deserve to be seen in full before anything is created.
//
// `blockers` is the contract: non-empty means Launch must stay disabled, and each
// entry is written for the person who has to fix it, not for a log.
func (s *server) handleCampaignAdsPreview(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	campaignID := r.PathValue("id")
	ctx := r.Context()

	var (
		name, adsStatus          string
		monthlyBudget, targetCPL *float64
		cities                   []string
		ageMin, ageMax           int
		gender                   string
		advantage                bool
		accountName              string
		accessMode               *string
	)
	err := s.pool.QueryRow(ctx,
		`SELECT c.name, COALESCE(c.ads_status,''), c.monthly_budget, c.target_cpl,
		        COALESCE(c.covered_cities,'{}'), c.target_age_min, c.target_age_max,
		        c.target_gender, c.advantage_audience_enabled,
		        COALESCE(aa.name,''), aa.access_mode
		   FROM campaigns c
		   LEFT JOIN ad_accounts aa ON aa.id = c.managed_ad_account_id
		  WHERE c.id=$1::uuid AND c.organization_id=$2`,
		campaignID, a.OrgID).Scan(&name, &adsStatus, &monthlyBudget, &targetCPL,
		&cities, &ageMin, &ageMax, &gender, &advantage, &accountName, &accessMode)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	var blockers []string
	if accessMode == nil {
		blockers = append(blockers, "No ad account is connected to this campaign.")
	} else if *accessMode != "manage" {
		blockers = append(blockers, "The ad account "+accountName+" is connected for reporting only. Switch it to \"Manage ads\" first.")
	}
	if len(cities) == 0 {
		blockers = append(blockers, "No service area set. Add the cities this campaign serves.")
	}
	if monthlyBudget == nil || *monthlyBudget <= 0 {
		blockers = append(blockers, "No monthly budget set.")
	}

	// Geo: only what has been SETTLED counts. An unresolved city is the failure
	// this whole feature is built to prevent, so it blocks rather than warns.
	geoRows, _ := s.queryMaps(ctx,
		`SELECT query, meta_key, COALESCE(display_name,'') AS display_name,
		        COALESCE(region,'') AS region, COALESCE(meta_type,'') AS meta_type
		   FROM campaign_geo_targets WHERE campaign_id=$1::uuid ORDER BY query`, campaignID)
	if len(geoRows) < len(cities) {
		blockers = append(blockers, fmt.Sprintf(
			"%d of %d cities are not matched to a Meta location yet. Confirm them so the budget cannot land in the wrong province.",
			len(cities)-len(geoRows), len(cities)))
	}

	// Copy: the APPROVED set, never a draft. Generated text is not the client's
	// voice until a human says it is.
	copyRows, _ := s.queryMaps(ctx,
		`SELECT id::text AS id, primary_texts, headlines, descriptions, approved_at
		   FROM campaign_ad_copy
		  WHERE campaign_id=$1::uuid AND status='approved' LIMIT 1`, campaignID)
	if len(copyRows) == 0 {
		blockers = append(blockers, "No approved ad copy. Generate it, read it, then approve.")
	}

	creativeRows, _ := s.queryMaps(ctx,
		`SELECT id::text AS id, file_url, media_type, file_name,
		        (meta_image_hash IS NOT NULL OR meta_video_id IS NOT NULL) AS on_meta
		   FROM campaign_creatives WHERE campaign_id=$1::uuid ORDER BY created_at`, campaignID)
	if len(creativeRows) == 0 {
		blockers = append(blockers, "No creative uploaded. Add at least one product photo or video.")
	}

	daily := 0.0
	if monthlyBudget != nil {
		daily = *monthlyBudget / 30.0
	}

	writeJSON(w, map[string]any{
		"campaign":   map[string]any{"name": name, "ads_status": adsStatus},
		"account":    map[string]any{"name": accountName, "access_mode": accessMode},
		"budget":     map[string]any{"monthly": monthlyBudget, "daily": daily, "target_cpl": targetCPL},
		"geo":        geoRows,
		"audience":   map[string]any{"age_min": ageMin, "age_max": ageMax, "gender": gender, "advantage_plus": advantage},
		"copy":       copyRows,
		"creatives":  creativeRows,
		"blockers":   blockers,
		"can_launch": len(blockers) == 0,
		// Stated rather than implied: a campaign is always created stopped, so
		// nobody discovers spend starting from a button labelled "Launch".
		"creates_paused": true,
	})
}
