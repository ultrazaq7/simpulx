package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"strconv"

	"github.com/simpulx/v2/libs/go/config"
)

// Send-location picker backend: proxy Google Places API (New) so the mobile
// composer can offer WhatsApp-style "nearby places" + place search WITHOUT
// shipping a web-service key in the app (the app's Maps SDK keys are
// package/bundle-restricted and can't call the Places web service). The server
// key lives in GOOGLE_MAPS_API_KEY; if it's unset the endpoints degrade to an
// empty list so the picker still works for "send current location" / drop-a-pin.

const placesBase = "https://places.googleapis.com/v1/places"

// placeResult is the trimmed shape the mobile picker consumes.
type placeResult struct {
	Name      string  `json:"name"`
	Address   string  `json:"address"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

// googlePlacesResp mirrors the fields we request via the X-Goog-FieldMask.
type googlePlacesResp struct {
	Places []struct {
		DisplayName struct {
			Text string `json:"text"`
		} `json:"displayName"`
		FormattedAddress string `json:"formattedAddress"`
		Location         struct {
			Latitude  float64 `json:"latitude"`
			Longitude float64 `json:"longitude"`
		} `json:"location"`
	} `json:"places"`
}

func parseFloatParam(r *http.Request, key string) float64 {
	f, _ := strconv.ParseFloat(r.URL.Query().Get(key), 64)
	return f
}

// callPlaces POSTs one Places API (New) request and maps the response to the
// trimmed picker shape. endpoint is ":searchText" or ":searchNearby".
func (s *server) callPlaces(ctx context.Context, endpoint string, body map[string]any) ([]placeResult, error) {
	apiKey := config.Get("GOOGLE_MAPS_API_KEY", "")
	if apiKey == "" {
		return []placeResult{}, nil // not configured: empty list, picker still usable
	}
	buf, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, placesBase+endpoint, bytes.NewReader(buf))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Goog-Api-Key", apiKey)
	req.Header.Set("X-Goog-FieldMask", "places.displayName,places.formattedAddress,places.location")
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		// Surface nothing rather than a 5xx: the picker degrades gracefully.
		return []placeResult{}, nil
	}
	var g googlePlacesResp
	if err := json.NewDecoder(resp.Body).Decode(&g); err != nil {
		return nil, err
	}
	out := make([]placeResult, 0, len(g.Places))
	for _, p := range g.Places {
		out = append(out, placeResult{
			Name:      p.DisplayName.Text,
			Address:   p.FormattedAddress,
			Latitude:  p.Location.Latitude,
			Longitude: p.Location.Longitude,
		})
	}
	return out, nil
}

// GET /api/places/nearby?lat=&lng= — WhatsApp-style nearby places, ranked by
// distance, for the send-location sheet.
func (s *server) handlePlacesNearby(w http.ResponseWriter, r *http.Request) {
	lat, lng := parseFloatParam(r, "lat"), parseFloatParam(r, "lng")
	if lat == 0 && lng == 0 {
		http.Error(w, "lat and lng required", http.StatusBadRequest)
		return
	}
	results, err := s.callPlaces(r.Context(), ":searchNearby", map[string]any{
		"maxResultCount": 18,
		"rankPreference": "DISTANCE",
		"languageCode":   "id",
		"locationRestriction": map[string]any{
			"circle": map[string]any{
				"center": map[string]any{"latitude": lat, "longitude": lng},
				"radius": 2000.0,
			},
		},
	})
	if err != nil {
		http.Error(w, "places lookup failed", http.StatusBadGateway)
		return
	}
	writeJSON(w, results)
}

// GET /api/places/staticmap?lat=&lng=&z= — Google Static Maps thumbnail for a
// shared-location bubble, proxied so the key stays server-side (the app's Maps
// keys are package-restricted and can't call a web service). Falls back to an
// OpenStreetMap tile when there's no key or Static Maps refuses, so the bubble
// always renders something rather than a broken image.
func (s *server) handleStaticMap(w http.ResponseWriter, r *http.Request) {
	lat, lng := parseFloatParam(r, "lat"), parseFloatParam(r, "lng")
	if lat == 0 && lng == 0 {
		http.Error(w, "lat and lng required", http.StatusBadRequest)
		return
	}
	zoom := r.URL.Query().Get("z")
	if zoom == "" {
		zoom = "16"
	}
	apiKey := config.Get("GOOGLE_MAPS_API_KEY", "")
	pos := strconv.FormatFloat(lat, 'f', 6, 64) + "," + strconv.FormatFloat(lng, 'f', 6, 64)
	if apiKey == "" {
		http.Redirect(w, r, osmTileURL(lat, lng), http.StatusFound)
		return
	}
	u := "https://maps.googleapis.com/maps/api/staticmap?center=" + pos +
		"&zoom=" + zoom + "&size=480x260&scale=2&maptype=roadmap" +
		"&markers=color:red%7C" + pos + "&key=" + apiKey
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, u, nil)
	if err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	resp, err := s.httpClient.Do(req)
	if err != nil {
		http.Redirect(w, r, osmTileURL(lat, lng), http.StatusFound)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		http.Redirect(w, r, osmTileURL(lat, lng), http.StatusFound)
		return
	}
	w.Header().Set("Content-Type", "image/png")
	// A pinned location never moves, so let clients cache the thumbnail hard.
	w.Header().Set("Cache-Control", "public, max-age=604800")
	_, _ = io.Copy(w, resp.Body)
}

// osmTileURL is the keyless fallback: the single OSM tile containing the point.
func osmTileURL(lat, lng float64) string {
	const z = 15
	n := math.Pow(2, z)
	x := int((lng + 180) / 360 * n)
	latRad := lat * math.Pi / 180
	y := int((1 - math.Log(math.Tan(latRad)+1/math.Cos(latRad))/math.Pi) / 2 * n)
	return fmt.Sprintf("https://tile.openstreetmap.org/%d/%d/%d.png", z, x, y)
}

// GET /api/places/search?q=&lat=&lng= — text search for a place, biased to the
// caller's current location when provided.
func (s *server) handlePlacesSearch(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	if q == "" {
		writeJSON(w, []placeResult{})
		return
	}
	body := map[string]any{
		"textQuery":      q,
		"maxResultCount": 18,
		"languageCode":   "id",
	}
	lat, lng := parseFloatParam(r, "lat"), parseFloatParam(r, "lng")
	if lat != 0 || lng != 0 {
		body["locationBias"] = map[string]any{
			"circle": map[string]any{
				"center": map[string]any{"latitude": lat, "longitude": lng},
				"radius": 30000.0,
			},
		}
	}
	results, err := s.callPlaces(r.Context(), ":searchText", body)
	if err != nil {
		http.Error(w, "places search failed", http.StatusBadGateway)
		return
	}
	writeJSON(w, results)
}
