package main

import (
	"encoding/json"
	"net/http"
	"strconv"
)

// ── Segment-generic campaign catalog / KB (WS-A) ────────────────────────────
// Per-campaign sellable items the Simpuler bot grounds pricing answers on.
// Scoped by (organization_id, campaign_id) so one campaign never sees another's
// pricing (fixes the global finance_packages cross-dealer leak). The spine
// columns are segment-agnostic; segment-specific fields live in `attributes`.

type catalogRow struct {
	ItemName      string          `json:"item_name"`
	VariantName   string          `json:"variant_name"`
	LocationName  string          `json:"location_name"`
	CategoryType  string          `json:"category_type"`
	Segment       string          `json:"segment"`
	HeadlinePrice *float64        `json:"headline_price"`
	Attributes    json.RawMessage `json:"attributes"`
}

// GET /api/campaigns/{id}/catalog — list a campaign's catalog rows.
func (s *server) handleListCatalog(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	cid := r.PathValue("id")
	limit := 500
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 5000 {
			limit = n
		}
	}
	rows, err := s.queryMaps(r.Context(),
		`SELECT cc.id, cc.segment, cc.category_type, cc.item_name, cc.variant_name,
		        cc.location_name, cc.headline_price, cc.effective_month, cc.source_ref,
		        cc.attributes, cc.created_at
		   FROM campaign_catalog cc JOIN campaigns c ON c.id=cc.campaign_id
		  WHERE cc.campaign_id=$1::uuid AND c.organization_id=$2
		  ORDER BY cc.item_name, cc.variant_name LIMIT $3`,
		cid, a.OrgID, limit)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

// POST /api/campaigns/{id}/catalog — bulk upload rows.
// {effective_month, source_ref, segment, replace, rows:[...]}. replace=true clears
// the campaign's existing catalog first (a fresh pricelist supersedes the old one).
func (s *server) handleUploadCatalog(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	cid := r.PathValue("id")
	var b struct {
		EffectiveMonth string       `json:"effective_month"`
		SourceRef      string       `json:"source_ref"`
		Segment        string       `json:"segment"`
		Replace        bool         `json:"replace"`
		Rows           []catalogRow `json:"rows"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if len(b.Rows) == 0 {
		http.Error(w, "no rows", http.StatusBadRequest)
		return
	}
	// The campaign must belong to the caller's org.
	var orgOK bool
	if err := s.pool.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM campaigns WHERE id=$1::uuid AND organization_id=$2)`, cid, a.OrgID).Scan(&orgOK); err != nil || !orgOK {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	tx, err := s.pool.Begin(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	if b.Replace {
		if _, err := tx.Exec(r.Context(), `DELETE FROM campaign_catalog WHERE campaign_id=$1::uuid`, cid); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}
	inserted := 0
	for _, row := range b.Rows {
		if row.ItemName == "" {
			continue
		}
		attrs := row.Attributes
		if len(attrs) == 0 {
			attrs = json.RawMessage("{}")
		}
		seg := row.Segment
		if seg == "" {
			seg = b.Segment
		}
		if _, err := tx.Exec(r.Context(),
			`INSERT INTO campaign_catalog
			   (organization_id, campaign_id, segment, category_type, item_name, variant_name,
			    location_name, headline_price, effective_month, source_ref, attributes)
			 VALUES ($1,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
			a.OrgID, cid, seg, row.CategoryType, row.ItemName, row.VariantName,
			row.LocationName, row.HeadlinePrice, b.EffectiveMonth, b.SourceRef, attrs); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		inserted++
	}
	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"inserted": inserted, "replaced": b.Replace})
}

// DELETE /api/campaigns/{id}/catalog — clear a campaign's catalog.
func (s *server) handleClearCatalog(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	cid := r.PathValue("id")
	tag, err := s.pool.Exec(r.Context(),
		`DELETE FROM campaign_catalog cc USING campaigns c
		  WHERE cc.campaign_id=$1::uuid AND c.id=cc.campaign_id AND c.organization_id=$2`, cid, a.OrgID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"deleted": tag.RowsAffected()})
}
