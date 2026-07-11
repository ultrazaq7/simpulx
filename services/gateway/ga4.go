package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/simpulx/v2/libs/go/config"
)

// GA4 (Google Analytics 4) connections. Connect a property (property id + an
// OAuth refresh token minted with the analytics.readonly scope), optionally map
// it to one of our campaigns, and pull landing-page performance from the GA4
// Data API for the campaign report. The OAuth client_id/secret reuse the Google
// Ads env vars (GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET), so the same
// Google Cloud OAuth client authorizes both.

// GET /api/ga4-connections
func (s *server) handleListGa4Connections(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	rows, err := s.queryMaps(r.Context(),
		`SELECT g.id::text AS id, g.property_id, COALESCE(g.name,'') AS name,
		        g.campaign_id::text AS campaign_id, c.name AS campaign_name,
		        g.last_synced_at, g.last_error, g.created_at
		   FROM ga4_connections g LEFT JOIN campaigns c ON c.id = g.campaign_id
		  WHERE g.organization_id = $1
		  ORDER BY g.created_at DESC`, a.OrgID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

// POST /api/ga4-connections
func (s *server) handleCreateGa4Connection(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var b struct {
		PropertyID   string  `json:"property_id"`
		RefreshToken string  `json:"refresh_token"`
		Name         string  `json:"name"`
		CampaignID   *string `json:"campaign_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	// Accept "properties/123456" or "123456".
	b.PropertyID = strings.TrimPrefix(strings.TrimSpace(b.PropertyID), "properties/")
	b.RefreshToken = strings.TrimSpace(b.RefreshToken)
	if b.PropertyID == "" || b.RefreshToken == "" {
		http.Error(w, "property id and refresh token are required", http.StatusBadRequest)
		return
	}
	var campID any
	if b.CampaignID != nil && *b.CampaignID != "" {
		campID = *b.CampaignID
	}
	var id string
	err := s.pool.QueryRow(r.Context(),
		`INSERT INTO ga4_connections (organization_id, property_id, refresh_token, name, campaign_id)
		 VALUES ($1,$2,$3,NULLIF($4,''),$5) RETURNING id::text`,
		a.OrgID, b.PropertyID, b.RefreshToken, b.Name, campID).Scan(&id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.audit(r.Context(), a, "connected", "ga4_connection", id, map[string]any{"property": b.PropertyID})
	writeJSON(w, map[string]any{"id": id})
}

// DELETE /api/ga4-connections/{id}
func (s *server) handleDeleteGa4Connection(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	id := r.PathValue("id")
	if _, err := s.pool.Exec(r.Context(),
		`DELETE FROM ga4_connections WHERE id=$1 AND organization_id=$2`, id, a.OrgID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.audit(r.Context(), a, "disconnected", "ga4_connection", id, nil)
	writeJSON(w, map[string]any{"ok": true})
}

// GET /api/campaigns/{id}/ga4?from&to — landing-page performance from GA4 for
// the connection mapped to this campaign (falls back to an org-wide, unmapped
// connection). Fetched live from the GA4 Data API; empty (not an error) when no
// connection exists so the panel can prompt the user to connect one.
func (s *server) handleCampaignGa4Report(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	campID := r.PathValue("id")
	var propertyID, refreshToken string
	err := s.pool.QueryRow(r.Context(),
		`SELECT property_id, refresh_token FROM ga4_connections
		  WHERE organization_id=$1 AND (campaign_id=$2 OR campaign_id IS NULL)
		  ORDER BY (campaign_id=$2) DESC, created_at DESC LIMIT 1`,
		a.OrgID, campID).Scan(&propertyID, &refreshToken)
	if err != nil {
		writeJSON(w, map[string]any{"connected": false, "rows": []any{}})
		return
	}
	from := r.URL.Query().Get("from")
	to := r.URL.Query().Get("to")
	if from == "" {
		from = "28daysAgo"
	}
	if to == "" {
		to = "today"
	}
	fail := func(msg string) {
		_, _ = s.pool.Exec(r.Context(),
			`UPDATE ga4_connections SET last_error=$2 WHERE property_id=$1 AND organization_id=$3`,
			propertyID, msg, a.OrgID)
		writeJSON(w, map[string]any{"connected": true, "error": msg, "rows": []any{}})
	}
	token, err := ga4AccessToken(r.Context(), refreshToken)
	if err != nil {
		fail(err.Error())
		return
	}
	report, err := ga4RunReport(r.Context(), propertyID, token, from, to)
	if err != nil {
		fail(err.Error())
		return
	}
	_, _ = s.pool.Exec(r.Context(),
		`UPDATE ga4_connections SET last_synced_at=now(), last_error=NULL WHERE property_id=$1 AND organization_id=$2`,
		propertyID, a.OrgID)
	report["connected"] = true
	writeJSON(w, report)
}

// GET /api/ga4/report?from&to — org-wide landing-page performance for the Ads
// Report PDF (not scoped to a campaign): uses the unmapped (org-wide) GA4
// connection if present, else the most recent one.
func (s *server) handleOrgGa4Report(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var propertyID, refreshToken string
	err := s.pool.QueryRow(r.Context(),
		`SELECT property_id, refresh_token FROM ga4_connections
		  WHERE organization_id=$1 ORDER BY (campaign_id IS NULL) DESC, created_at DESC LIMIT 1`,
		a.OrgID).Scan(&propertyID, &refreshToken)
	if err != nil {
		writeJSON(w, map[string]any{"connected": false, "rows": []any{}})
		return
	}
	from := r.URL.Query().Get("from")
	to := r.URL.Query().Get("to")
	if from == "" {
		from = "28daysAgo"
	}
	if to == "" {
		to = "today"
	}
	fail := func(msg string) {
		_, _ = s.pool.Exec(r.Context(),
			`UPDATE ga4_connections SET last_error=$2 WHERE property_id=$1 AND organization_id=$3`,
			propertyID, msg, a.OrgID)
		writeJSON(w, map[string]any{"connected": true, "error": msg, "rows": []any{}})
	}
	token, err := ga4AccessToken(r.Context(), refreshToken)
	if err != nil {
		fail(err.Error())
		return
	}
	report, err := ga4RunReport(r.Context(), propertyID, token, from, to)
	if err != nil {
		fail(err.Error())
		return
	}
	_, _ = s.pool.Exec(r.Context(),
		`UPDATE ga4_connections SET last_synced_at=now(), last_error=NULL WHERE property_id=$1 AND organization_id=$2`,
		propertyID, a.OrgID)
	report["connected"] = true
	writeJSON(w, report)
}

// ── Sign-in-with-Google for GA4 ────────────────────────────────────────────
// One-click GA4 connect so users never hand-copy a refresh token. Reuses the
// Google Ads OAuth client (same Google Cloud project) but asks for the
// analytics.readonly scope and lands on our GA4 callback. Flow:
//   1. POST /api/ga4/oauth/start → returns the Google consent URL.
//   2. Google redirects to GET /api/auth/ga4/callback → we exchange the code for
//      a refresh token and stash it as a short-lived "pending" entry per org.
//   3. GET /api/ga4/properties → lists the account's GA4 properties (Admin API).
//   4. POST /api/ga4/finish {property_id, campaign_id?} → persists the connection.

type ga4OAuthState struct {
	OrgID       string `json:"org_id"`
	UserID      string `json:"user_id"`
	RedirectURI string `json:"redirect_uri"`
}

type ga4Property struct {
	PropertyID  string `json:"property_id"`
	DisplayName string `json:"display_name"`
	AccountName string `json:"account_name"`
}

// ga4RedirectURI resolves the OAuth redirect. Prefer an explicit env (must match
// the Google Cloud console), else derive it from the incoming request.
func ga4RedirectURI(r *http.Request) string {
	if v := os.Getenv("GA4_REDIRECT_URL"); v != "" {
		return v
	}
	scheme := r.Header.Get("X-Forwarded-Proto")
	if scheme == "" {
		if r.TLS != nil {
			scheme = "https"
		} else if strings.HasPrefix(r.Host, "localhost") || strings.HasPrefix(r.Host, "127.0.0.1") {
			scheme = "http"
		} else {
			scheme = "https"
		}
	}
	return scheme + "://" + r.Host + "/api/auth/ga4/callback"
}

// POST /api/ga4/oauth/start → {url}
func (s *server) handleGa4OAuthStart(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	clientID := os.Getenv("GOOGLE_ADS_CLIENT_ID")
	if clientID == "" {
		http.Error(w, "Google sign-in is not configured on this server", http.StatusServiceUnavailable)
		return
	}
	redirectURI := ga4RedirectURI(r)
	stateID := uuid.New().String()
	b, _ := json.Marshal(ga4OAuthState{OrgID: a.OrgID, UserID: a.UserID, RedirectURI: redirectURI})
	s.rdb.Set(r.Context(), "oauth:ga4:"+stateID, b, 15*time.Minute)
	authURL := fmt.Sprintf(
		"https://accounts.google.com/o/oauth2/v2/auth?client_id=%s&redirect_uri=%s&response_type=code&scope=%s&access_type=offline&prompt=consent&include_granted_scopes=true&state=%s",
		url.QueryEscape(clientID), url.QueryEscape(redirectURI),
		url.QueryEscape("https://www.googleapis.com/auth/analytics.readonly"), stateID)
	writeJSON(w, map[string]string{"url": authURL})
}

// GET /api/auth/ga4/callback — Google redirects here with ?code&state. Always
// redirects back to the Analytics page (with ?ga4=connected or ?ga4_error=...).
func (s *server) handleGa4Callback(w http.ResponseWriter, r *http.Request) {
	appBase := config.Get("APP_BASE_URL", "http://localhost:3000")
	fail := func(msg string) {
		http.Redirect(w, r, appBase+"/settings/channels?tab=analytics&ga4_error="+url.QueryEscape(msg), http.StatusTemporaryRedirect)
	}
	code := r.URL.Query().Get("code")
	stateID := r.URL.Query().Get("state")
	if code == "" || stateID == "" {
		fail("Google sign-in was cancelled")
		return
	}
	raw, err := s.rdb.Get(r.Context(), "oauth:ga4:"+stateID).Bytes()
	if err != nil {
		fail("sign-in session expired, please try again")
		return
	}
	s.rdb.Del(r.Context(), "oauth:ga4:"+stateID)
	var st ga4OAuthState
	json.Unmarshal(raw, &st)

	data := url.Values{}
	data.Set("client_id", os.Getenv("GOOGLE_ADS_CLIENT_ID"))
	data.Set("client_secret", os.Getenv("GOOGLE_ADS_CLIENT_SECRET"))
	data.Set("code", code)
	data.Set("redirect_uri", st.RedirectURI)
	data.Set("grant_type", "authorization_code")
	resp, err := adHTTP.PostForm("https://oauth2.googleapis.com/token", data)
	if err != nil {
		fail("could not reach Google to complete sign-in")
		return
	}
	defer resp.Body.Close()
	var tok struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tok); err != nil || tok.RefreshToken == "" {
		fail("no refresh token received (revoke prior access at myaccount.google.com and retry)")
		return
	}
	// Stash the refresh token as a pending, org-scoped entry; the user then picks
	// which GA4 property to attach (listing properties needs this token).
	s.rdb.Set(r.Context(), "ga4:pending:"+st.OrgID, tok.RefreshToken, 20*time.Minute)
	http.Redirect(w, r, appBase+"/settings/channels?tab=analytics&ga4=connected", http.StatusTemporaryRedirect)
}

// GET /api/ga4/properties — after Google sign-in, list the account's GA4
// properties so the user can pick which to connect.
func (s *server) handleGa4PendingProperties(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	rt, err := s.rdb.Get(r.Context(), "ga4:pending:"+a.OrgID).Result()
	if err != nil || rt == "" {
		writeJSON(w, map[string]any{"pending": false, "properties": []ga4Property{}})
		return
	}
	props, err := ga4ListProperties(r.Context(), rt)
	if err != nil {
		writeJSON(w, map[string]any{"pending": true, "error": err.Error(), "properties": []ga4Property{}})
		return
	}
	writeJSON(w, map[string]any{"pending": true, "properties": props})
}

// POST /api/ga4/finish {property_id, name?, campaign_id?} — persist the connection
// using the pending refresh token from the Google sign-in.
func (s *server) handleGa4Finish(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var b struct {
		PropertyID string  `json:"property_id"`
		Name       string  `json:"name"`
		CampaignID *string `json:"campaign_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil || strings.TrimSpace(b.PropertyID) == "" {
		http.Error(w, "property_id required", http.StatusBadRequest)
		return
	}
	rt, err := s.rdb.Get(r.Context(), "ga4:pending:"+a.OrgID).Result()
	if err != nil || rt == "" {
		http.Error(w, "no pending Google sign-in; please connect again", http.StatusBadRequest)
		return
	}
	propertyID := strings.TrimPrefix(strings.TrimSpace(b.PropertyID), "properties/")
	var campID any
	if b.CampaignID != nil && *b.CampaignID != "" {
		campID = *b.CampaignID
	}
	var id string
	err = s.pool.QueryRow(r.Context(),
		`INSERT INTO ga4_connections (organization_id, property_id, refresh_token, name, campaign_id)
		 VALUES ($1,$2,$3,NULLIF($4,''),$5) RETURNING id::text`,
		a.OrgID, propertyID, rt, b.Name, campID).Scan(&id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.rdb.Del(r.Context(), "ga4:pending:"+a.OrgID)
	s.audit(r.Context(), a, "connected", "ga4_connection", id, map[string]any{"property": propertyID, "via": "oauth"})
	writeJSON(w, map[string]any{"id": id})
}

// ga4ListProperties enumerates the account's GA4 properties via the Admin API
// accountSummaries endpoint (needs analytics.readonly).
func ga4ListProperties(ctx context.Context, refreshToken string) ([]ga4Property, error) {
	token, err := ga4AccessToken(ctx, refreshToken)
	if err != nil {
		return nil, err
	}
	out := []ga4Property{}
	pageToken := ""
	for {
		u := "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200"
		if pageToken != "" {
			u += "&pageToken=" + url.QueryEscape(pageToken)
		}
		req, _ := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
		req.Header.Set("Authorization", "Bearer "+token)
		resp, err := adHTTP.Do(req)
		if err != nil {
			return nil, err
		}
		var body struct {
			AccountSummaries []struct {
				DisplayName       string `json:"displayName"`
				PropertySummaries []struct {
					Property    string `json:"property"`
					DisplayName string `json:"displayName"`
				} `json:"propertySummaries"`
			} `json:"accountSummaries"`
			NextPageToken string `json:"nextPageToken"`
			Error         struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		err = json.NewDecoder(resp.Body).Decode(&body)
		resp.Body.Close()
		if err != nil {
			return nil, err
		}
		if body.Error.Message != "" {
			return nil, fmt.Errorf("ga4: %s", body.Error.Message)
		}
		for _, acc := range body.AccountSummaries {
			for _, p := range acc.PropertySummaries {
				out = append(out, ga4Property{
					PropertyID:  strings.TrimPrefix(p.Property, "properties/"),
					DisplayName: p.DisplayName,
					AccountName: acc.DisplayName,
				})
			}
		}
		if body.NextPageToken == "" {
			break
		}
		pageToken = body.NextPageToken
	}
	return out, nil
}

// ga4AccessToken exchanges a stored refresh token for a short-lived access token
// (same flow as the Google Ads sync), reusing the Google Ads OAuth client.
func ga4AccessToken(ctx context.Context, refreshToken string) (string, error) {
	clientID := os.Getenv("GOOGLE_ADS_CLIENT_ID")
	clientSecret := os.Getenv("GOOGLE_ADS_CLIENT_SECRET")
	if clientID == "" || clientSecret == "" {
		return "", fmt.Errorf("GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET not configured")
	}
	form := url.Values{}
	form.Set("client_id", clientID)
	form.Set("client_secret", clientSecret)
	form.Set("refresh_token", refreshToken)
	form.Set("grant_type", "refresh_token")
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, "https://oauth2.googleapis.com/token", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := adHTTP.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	var tok struct {
		AccessToken string `json:"access_token"`
		Error       string `json:"error_description"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&tok)
	if tok.AccessToken == "" {
		if tok.Error == "" {
			tok.Error = "could not refresh GA4 token"
		}
		return "", fmt.Errorf("ga4: %s", tok.Error)
	}
	return tok.AccessToken, nil
}

// ga4RunReport calls the GA4 Data API runReport for top landing pages.
func ga4RunReport(ctx context.Context, propertyID, token, from, to string) (map[string]any, error) {
	body := map[string]any{
		"dateRanges": []map[string]string{{"startDate": from, "endDate": to}},
		"dimensions": []map[string]string{{"name": "landingPagePlusQueryString"}},
		"metrics": []map[string]string{
			{"name": "sessions"}, {"name": "engagedSessions"}, {"name": "engagementRate"},
			{"name": "userEngagementDuration"}, {"name": "screenPageViews"},
			{"name": "totalUsers"}, {"name": "activeUsers"}, {"name": "newUsers"},
		},
		"orderBys": []map[string]any{{"metric": map[string]string{"metricName": "sessions"}, "desc": true}},
		"limit":    "25",
	}
	buf, _ := json.Marshal(body)
	u := fmt.Sprintf("https://analyticsdata.googleapis.com/v1beta/properties/%s:runReport", url.PathEscape(propertyID))
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, u, strings.NewReader(string(buf)))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := adHTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var raw struct {
		Rows []struct {
			DimensionValues []struct {
				Value string `json:"value"`
			} `json:"dimensionValues"`
			MetricValues []struct {
				Value string `json:"value"`
			} `json:"metricValues"`
		} `json:"rows"`
		Totals []struct {
			MetricValues []struct {
				Value string `json:"value"`
			} `json:"metricValues"`
		} `json:"totals"`
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, err
	}
	if raw.Error.Message != "" {
		return nil, fmt.Errorf("ga4: %s", raw.Error.Message)
	}
	num := func(s string) float64 { v, _ := strconv.ParseFloat(s, 64); return v }
	rowsOut := make([]map[string]any, 0, len(raw.Rows))
	for _, rr := range raw.Rows {
		lp := ""
		if len(rr.DimensionValues) > 0 {
			lp = rr.DimensionValues[0].Value
		}
		m := rr.MetricValues
		get := func(i int) float64 {
			if i < len(m) {
				return num(m[i].Value)
			}
			return 0
		}
		sessions := get(0)
		rowsOut = append(rowsOut, map[string]any{
			"landing_page":       lp,
			"sessions":           sessions,
			"engaged_sessions":   get(1),
			"engagement_rate":    get(2),
			"avg_engagement_sec": divSafe(get(3), sessions),
			"views":              get(4),
			"total_users":        get(5),
			"active_users":       get(6),
			"new_users":          get(7),
		})
	}
	out := map[string]any{"rows": rowsOut}
	if len(raw.Totals) > 0 {
		tm := raw.Totals[0].MetricValues
		tget := func(i int) float64 {
			if i < len(tm) {
				return num(tm[i].Value)
			}
			return 0
		}
		tSessions := tget(0)
		out["totals"] = map[string]any{
			"sessions":           tSessions,
			"engaged_sessions":   tget(1),
			"engagement_rate":    tget(2),
			"avg_engagement_sec": divSafe(tget(3), tSessions),
			"views":              tget(4),
			"total_users":        tget(5),
			"active_users":       tget(6),
			"new_users":          tget(7),
		}
	}
	return out, nil
}

func divSafe(a, b float64) float64 {
	if b > 0 {
		return a / b
	}
	return 0
}
