package main

import (
	"encoding/json"
	"net/http"
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
	return s == PropertyIndustry || strings.Contains(s, "propert") || strings.Contains(s, "real estate")
}

// Columns shared by the admin list and the public reader, minus the heavy ones.
const listingCols = `id::text AS id, campaign_id::text AS campaign_id, slug, title,
	property_type, status, price, location_area, city, address, latitude, longitude,
	bedrooms, bathrooms, land_area, building_area, certificate, description,
	photos, attributes, sort_order, published_at, created_at, updated_at`

type listingInput struct {
	CampaignID   *string          `json:"campaign_id"`
	Slug         *string          `json:"slug"`
	Title        *string          `json:"title"`
	PropertyType *string          `json:"property_type"`
	Status       *string          `json:"status"`
	Price        *float64         `json:"price"`
	LocationArea *string          `json:"location_area"`
	City         *string          `json:"city"`
	Address      *string          `json:"address"`
	Latitude     *float64         `json:"latitude"`
	Longitude    *float64         `json:"longitude"`
	Bedrooms     *int             `json:"bedrooms"`
	Bathrooms    *int             `json:"bathrooms"`
	LandArea     *float64         `json:"land_area"`
	BuildingArea *float64         `json:"building_area"`
	Certificate  *string          `json:"certificate"`
	Description  *string          `json:"description"`
	Photos       json.RawMessage  `json:"photos"`
	Attributes   json.RawMessage  `json:"attributes"`
	SortOrder    *int             `json:"sort_order"`
}

// GET /api/listings — every listing in the org (any status), newest first.
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

// PATCH /api/listings/{id} — partial update. Only fields present in the body
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
