package main

import (
	"context"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Resolve a Google Maps SHARE link to coordinates so an admin can paste a link
// instead of hunting for latitude/longitude. Full map URLs are parsed in the
// browser; only SHORT links (maps.app.goo.gl, goo.gl/maps) need the server,
// because resolving them means following a redirect the browser can't (CORS).

// coordRes: the same pin/@/q ordering the client parser uses -- the place PIN
// (!3d/!4d) is the real marker and wins over the map centre (@lat,lng).
var coordPatterns = []*regexp.Regexp{
	regexp.MustCompile(`!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)`),
	regexp.MustCompile(`@(-?\d+\.\d+),(-?\d+\.\d+)`),
	regexp.MustCompile(`[?&](?:q|query|ll|sll|center|destination)=(-?\d+\.\d+),(-?\d+\.\d+)`),
}

func parseMapsCoords(s string) (float64, float64, bool) {
	for _, re := range coordPatterns {
		if m := re.FindStringSubmatch(s); m != nil {
			lat, e1 := strconv.ParseFloat(m[1], 64)
			lng, e2 := strconv.ParseFloat(m[2], 64)
			if e1 == nil && e2 == nil && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 {
				return lat, lng, true
			}
		}
	}
	return 0, 0, false
}

// Only these hosts are ever fetched. This is an SSRF guard: the endpoint takes a
// user-supplied URL, so it must never be pointed at internal services.
var allowedMapsHost = regexp.MustCompile(`(^|\.)(google\.com|goo\.gl|google\.[a-z.]+|app\.goo\.gl)$`)

// GET /api/geo/resolve?url=<google maps share link> -> {lat,lng}
func (s *server) handleResolveMapsLink(w http.ResponseWriter, r *http.Request) {
	raw := strings.TrimSpace(r.URL.Query().Get("url"))
	if raw == "" {
		http.Error(w, "url required", http.StatusBadRequest)
		return
	}
	// A full link may already carry coordinates -> answer without any fetch.
	if lat, lng, ok := parseMapsCoords(raw); ok {
		writeJSON(w, map[string]any{"lat": lat, "lng": lng})
		return
	}
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || !allowedMapsHost.MatchString(strings.ToLower(u.Hostname())) {
		http.Error(w, "only Google Maps links are supported", http.StatusBadRequest)
		return
	}

	// Follow up to 5 redirects (short links usually take 1-2 hops), inspecting each
	// Location for coordinates -- the coords often appear before the final page.
	client := &http.Client{
		Timeout: 8 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return http.ErrUseLastResponse
			}
			if !allowedMapsHost.MatchString(strings.ToLower(req.URL.Hostname())) {
				return http.ErrUseLastResponse // never chase a redirect off Google
			}
			return nil
		},
	}
	ctx, cancel := context.WithTimeout(r.Context(), 9*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, raw, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; SimpulxBot/1.0)")
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, "could not resolve the link", http.StatusUnprocessableEntity)
		return
	}
	defer resp.Body.Close()

	// Final URL first (redirects usually land on a /maps/place/@lat,lng page).
	if lat, lng, ok := parseMapsCoords(resp.Request.URL.String()); ok {
		writeJSON(w, map[string]any{"lat": lat, "lng": lng})
		return
	}
	// Else scan the first chunk of the body (the canonical/og:url carries coords).
	buf := make([]byte, 64<<10)
	n, _ := resp.Body.Read(buf)
	if lat, lng, ok := parseMapsCoords(string(buf[:n])); ok {
		writeJSON(w, map[string]any{"lat": lat, "lng": lng})
		return
	}
	http.Error(w, "no coordinates found in that link", http.StatusUnprocessableEntity)
}
