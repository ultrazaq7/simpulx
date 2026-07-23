package main

import (
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"strings"
)

// ── Property listings (e-catalog) ───────────────────────────
// One public listing site per ORGANISATION (/listing/{org-slug}). Admin CRUD is
// org-scoped and gated on manage_campaigns; the public reader is unauthenticated
// and only ever returns rows the org explicitly published.
//
// Why not campaign_catalog: that is a per-campaign PRICELIST (one unit explodes
// into variant x tenor rows) read only by the AI. A listing is one physical unit
// with photos, a slug and publish state, shown to buyers. See 0107_listings.sql.

// PropertyIndustry is the canonical segment string (same vocabulary campaigns and
// services/ai-agent/segments.py use) that unlocks the Listings surface.
const PropertyIndustry = "property / real estate"

// isPropertyIndustry reports whether an org's industry is property. Matched
// loosely: the value is picked from a dropdown, but older orgs typed it freehand
// ("Property", "Real Estate"), and those should not silently lose the feature.
func isPropertyIndustry(industry string) bool {
	s := strings.ToLower(strings.TrimSpace(industry))
	// Unset industry counts as property-capable ON PURPOSE: hiding Listings from
	// an org whose industry simply was not filled in at onboarding reads as a
	// missing feature, not as segmentation. Only a filled-in non-property
	// industry hides the menu.
	if s == "" {
		return true
	}
	return s == PropertyIndustry || strings.Contains(s, "propert") || strings.Contains(s, "real estate")
}

// Columns shared by the admin list and the public reader, minus the heavy ones.
const listingCols = `id::text AS id, campaign_id::text AS campaign_id, slug, title,
	property_type, status, price, location_area, city, address, latitude, longitude,
	bedrooms, bathrooms, land_area, building_area, certificate, description,
	photos, attributes, sort_order, published_at, created_at, updated_at, view_count`

type listingInput struct {
	CampaignID   *string         `json:"campaign_id"`
	Slug         *string         `json:"slug"`
	Title        *string         `json:"title"`
	PropertyType *string         `json:"property_type"`
	Status       *string         `json:"status"`
	Price        *float64        `json:"price"`
	LocationArea *string         `json:"location_area"`
	City         *string         `json:"city"`
	Address      *string         `json:"address"`
	Latitude     *float64        `json:"latitude"`
	Longitude    *float64        `json:"longitude"`
	Bedrooms     *int            `json:"bedrooms"`
	Bathrooms    *int            `json:"bathrooms"`
	LandArea     *float64        `json:"land_area"`
	BuildingArea *float64        `json:"building_area"`
	Certificate  *string         `json:"certificate"`
	Description  *string         `json:"description"`
	Photos       json.RawMessage `json:"photos"`
	Attributes   json.RawMessage `json:"attributes"`
	SortOrder    *int            `json:"sort_order"`
}

// GET /api/listings - every listing in the org (any status), newest first.
func (s *server) handleListListings(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	rows, err := s.queryMaps(r.Context(),
		`SELECT `+listingCols+` FROM listings
		  WHERE organization_id=$1
		  ORDER BY sort_order, updated_at DESC`, a.OrgID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

// POST /api/listings
func (s *server) handleCreateListing(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var b listingInput
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil || b.Title == nil || *b.Title == "" {
		http.Error(w, "title required", http.StatusBadRequest)
		return
	}
	slug := ""
	if b.Slug != nil {
		slug = slugify(*b.Slug)
	}
	if slug == "" {
		slug = slugify(*b.Title)
	}
	if slug == "" {
		slug = "unit"
	}
	// Slug is unique per org: suffix -2, -3 ... until it lands. Bounded so a
	// pathological collision can never spin.
	base, id := slug, ""
	for i := 2; i < 60; i++ {
		err := s.pool.QueryRow(r.Context(),
			`INSERT INTO listings (organization_id, campaign_id, slug, title, property_type,
			   status, price, location_area, city, address, latitude, longitude, bedrooms,
			   bathrooms, land_area, building_area, certificate, description, photos,
			   attributes, sort_order)
			 VALUES ($1, NULLIF($2,'')::uuid, $3, $4, $5,
			   COALESCE(NULLIF($6,''),'draft'), $7, $8, $9, $10, $11, $12, $13,
			   $14, $15, $16, $17, $18, COALESCE($19::jsonb,'[]'::jsonb),
			   COALESCE($20::jsonb,'{}'::jsonb), COALESCE($21,0))
			 RETURNING id::text`,
			a.OrgID, derefStr(b.CampaignID), slug, *b.Title, derefStr(b.PropertyType),
			derefStr(b.Status), b.Price, derefStr(b.LocationArea), derefStr(b.City),
			derefStr(b.Address), b.Latitude, b.Longitude, b.Bedrooms, b.Bathrooms,
			b.LandArea, b.BuildingArea, derefStr(b.Certificate), derefStr(b.Description),
			rawOrNil(b.Photos), rawOrNil(b.Attributes), b.SortOrder,
		).Scan(&id)
		if err == nil {
			break
		}
		if !strings.Contains(err.Error(), "listings_organization_id_slug_key") {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		slug = base + "-" + strconv.Itoa(i)
	}
	if id == "" {
		http.Error(w, "could not allocate a unique slug", http.StatusConflict)
		return
	}
	s.audit(r.Context(), a, "created", "listing", id, map[string]any{"title": *b.Title})
	writeJSON(w, map[string]any{"id": id, "slug": slug})
}

// PATCH /api/listings/{id} - partial update. Only fields present in the body
// change; published_at is stamped the first time a listing goes public.
func (s *server) handleUpdateListing(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var b listingInput
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	var slug *string
	if b.Slug != nil {
		v := slugify(*b.Slug)
		if v != "" {
			slug = &v
		}
	}
	ct, err := s.pool.Exec(r.Context(),
		`UPDATE listings SET
		   campaign_id   = CASE WHEN $3::text IS NULL THEN campaign_id ELSE NULLIF($3,'')::uuid END,
		   slug          = COALESCE($4, slug),
		   title         = COALESCE($5, title),
		   property_type = COALESCE($6, property_type),
		   status        = COALESCE($7, status),
		   price         = COALESCE($8, price),
		   location_area = COALESCE($9, location_area),
		   city          = COALESCE($10, city),
		   address       = COALESCE($11, address),
		   latitude      = COALESCE($12, latitude),
		   longitude     = COALESCE($13, longitude),
		   bedrooms      = COALESCE($14, bedrooms),
		   bathrooms     = COALESCE($15, bathrooms),
		   land_area     = COALESCE($16, land_area),
		   building_area = COALESCE($17, building_area),
		   certificate   = COALESCE($18, certificate),
		   description   = COALESCE($19, description),
		   photos        = COALESCE($20::jsonb, photos),
		   attributes    = COALESCE($21::jsonb, attributes),
		   sort_order    = COALESCE($22, sort_order),
		   published_at  = CASE WHEN COALESCE($7, status) = 'published' AND published_at IS NULL
		                        THEN now() ELSE published_at END,
		   updated_at    = now()
		 WHERE id=$1 AND organization_id=$2`,
		r.PathValue("id"), a.OrgID, b.CampaignID, slug, b.Title, b.PropertyType,
		b.Status, b.Price, b.LocationArea, b.City, b.Address, b.Latitude, b.Longitude,
		b.Bedrooms, b.Bathrooms, b.LandArea, b.BuildingArea, b.Certificate,
		b.Description, rawOrNil(b.Photos), rawOrNil(b.Attributes), b.SortOrder,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if ct.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	s.audit(r.Context(), a, "updated", "listing", r.PathValue("id"), nil)
	w.WriteHeader(http.StatusNoContent)
}

// ── Public reader (no auth) ─────────────────────────────────
// Serves the per-client listing site. Everything here is scoped by the org SLUG
// from the URL and hard-filtered to status='published', so an unauthenticated
// caller can never see drafts, another org's stock, or any internal column.

// publicOrgInfo is the tenant identity the microsite renders. Every client gets
// their OWN site (own URL, own inventory, own WhatsApp), and branding lets it
// carry their own logo/colour instead of looking like a shared template.
type publicOrgInfo struct {
	ID       string `json:"-"`
	Name     string `json:"name"`
	Slug     string `json:"slug"`
	WhatsApp string `json:"whatsapp"`
	Logo     string `json:"logo"`
	Accent   string `json:"accent"`
	Tagline  string `json:"tagline"`
}

// publicOrg resolves an org slug to its id + public profile, or 404s.
func (s *server) publicOrg(w http.ResponseWriter, r *http.Request, slug string) (publicOrgInfo, bool) {
	var o publicOrgInfo
	o.Slug = slug
	// display_id is the channel's human-facing identifier; for WhatsApp that is the
	// phone number, which is what a wa.me deep link needs.
	err := s.pool.QueryRow(r.Context(),
		`SELECT o.id::text, o.name,
		        COALESCE((SELECT c.display_id FROM channels c
		                   WHERE c.organization_id=o.id AND c.type='whatsapp' AND c.is_active
		                   ORDER BY c.created_at LIMIT 1), ''),
		        COALESCE(o.settings->'branding'->>'logo_url',''),
		        COALESCE(o.settings->'branding'->>'accent',''),
		        COALESCE(o.settings->'branding'->>'tagline','')
		   FROM organizations o WHERE o.slug=$1`, slug).
		Scan(&o.ID, &o.Name, &o.WhatsApp, &o.Logo, &o.Accent, &o.Tagline)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return o, false
	}
	return o, true
}

// GET /api/public/listings/{org} - published inventory + the filter facets the
// site needs. Filters are applied server-side so a large catalogue never ships
// in full to the browser.
func (s *server) handlePublicListings(w http.ResponseWriter, r *http.Request) {
	org, ok := s.publicOrg(w, r, r.PathValue("org"))
	if !ok {
		return
	}
	q := r.URL.Query()
	args := []any{org.ID}
	where := ""
	// bind appends a value and returns its placeholder ($2, $3, ...), so a clause
	// can reference the same bound value more than once (city matches two columns).
	bind := func(val any) string {
		args = append(args, val)
		return "$" + strconv.Itoa(len(args))
	}
	if v := strings.TrimSpace(q.Get("type")); v != "" {
		where += " AND property_type = " + bind(v)
	}
	if v := strings.TrimSpace(q.Get("city")); v != "" {
		p := bind(v)
		where += " AND (city ILIKE '%' || " + p + " || '%' OR location_area ILIKE '%' || " + p + " || '%')"
	}
	if v := q.Get("min_price"); v != "" {
		if n, err := strconv.ParseFloat(v, 64); err == nil {
			where += " AND price >= " + bind(n)
		}
	}
	if v := q.Get("max_price"); v != "" {
		if n, err := strconv.ParseFloat(v, 64); err == nil {
			where += " AND price <= " + bind(n)
		}
	}
	if v := q.Get("beds"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			where += " AND bedrooms >= " + bind(n)
		}
	}
	if v := strings.TrimSpace(q.Get("q")); v != "" {
		p := bind(v)
		where += " AND (title ILIKE '%' || " + p + " || '%' OR description ILIKE '%' || " + p + " || '%')"
	}
	rows, err := s.queryMaps(r.Context(),
		`SELECT `+listingCols+` FROM listings
		  WHERE organization_id=$1 AND status='published'`+where+`
		  ORDER BY sort_order, published_at DESC NULLS LAST, created_at DESC
		  LIMIT 200`, args...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	// Facets come from the org's whole published set (not the filtered slice) so the
	// filter options don't vanish as the visitor narrows things down.
	facets, _ := s.queryMaps(r.Context(),
		`SELECT COALESCE(property_type,'') AS property_type, COALESCE(city,'') AS city
		   FROM listings WHERE organization_id=$1 AND status='published'`, org.ID)
	types, cities := map[string]bool{}, map[string]bool{}
	for _, f := range facets {
		if v, _ := f["property_type"].(string); v != "" {
			types[v] = true
		}
		if v, _ := f["city"].(string); v != "" {
			cities[v] = true
		}
	}
	writeJSON(w, map[string]any{
		"org":      org,
		"listings": rows,
		"facets":   map[string]any{"types": keysOf(types), "cities": keysOf(cities)},
	})
}

// GET /api/public/listings/{org}/{slug} - one published unit (404 while draft).
func (s *server) handlePublicListing(w http.ResponseWriter, r *http.Request) {
	org, ok := s.publicOrg(w, r, r.PathValue("org"))
	if !ok {
		return
	}
	rows, err := s.queryMaps(r.Context(),
		`SELECT `+listingCols+` FROM listings
		  WHERE organization_id=$1 AND slug=$2 AND status='published' LIMIT 1`,
		org.ID, r.PathValue("slug"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if len(rows) == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	// One public detail hit = one view. Best-effort and fire-and-forget: a
	// counter update must never slow down or fail the page itself.
	_, _ = s.pool.Exec(r.Context(),
		`UPDATE listings SET view_count = view_count + 1 WHERE organization_id=$1 AND slug=$2`,
		org.ID, r.PathValue("slug"))
	// A few nearby units keep the visitor browsing instead of bouncing.
	related, _ := s.queryMaps(r.Context(),
		`SELECT `+listingCols+` FROM listings
		  WHERE organization_id=$1 AND status='published' AND slug <> $2
		  ORDER BY (city IS NOT DISTINCT FROM (SELECT city FROM listings WHERE organization_id=$1 AND slug=$2)) DESC,
		           sort_order, created_at DESC
		  LIMIT 3`, org.ID, r.PathValue("slug"))
	writeJSON(w, map[string]any{
		"org":     org,
		"listing": rows[0],
		"related": related,
	})
}

func keysOf(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// DELETE /api/listings/{id}
func (s *server) handleDeleteListing(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	ct, err := s.pool.Exec(r.Context(),
		`DELETE FROM listings WHERE id=$1 AND organization_id=$2`, r.PathValue("id"), a.OrgID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if ct.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	s.audit(r.Context(), a, "deleted", "listing", r.PathValue("id"), nil)
	w.WriteHeader(http.StatusNoContent)
}
