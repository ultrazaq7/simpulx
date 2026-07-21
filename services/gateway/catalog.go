package main

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
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
	// Default high enough to show a whole pricelist: one upload is (items x tenors x
	// locations) rows, which easily tops 500 — and because rows are ORDER BY item_name,
	// a 500 cap silently hid everything late in the alphabet (e.g. XForce under "X").
	limit := 20000
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 20000 {
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
	inserted, skipped := 0, 0
	for _, row := range b.Rows {
		if strings.TrimSpace(row.ItemName) == "" {
			skipped++ // a nameless row (e.g. a mis-extracted PDF cell) — count it so the caller sees it, don't just vanish it
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
	// NOTE: the catalog no longer writes campaigns.covered_cities. It used to
	// overwrite it on every Replace, which made the pricelist the de-facto owner of
	// the service area, with two bad consequences: a campaign with no catalog (a
	// lender, a clinic, a course) could never have an area at all, and a Replace
	// whose rows carried no location wiped it to '{}' silently, turning every later
	// lead into an out-of-area handoff.
	//
	// The area is now a campaign field, edited directly (PATCH /api/campaigns/{id}),
	// and the upload READS it to fan each product out per city. Pricing a city and
	// serving it are separate claims, so the flow no longer conflates them.
	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"inserted": inserted, "skipped": skipped, "replaced": b.Replace})
}

// POST /api/campaigns/{id}/catalog/extract {pdf_base64, segment?} — kick off an
// ASYNC LLM extraction (WS-A). LLM PDF extraction can take minutes, which blows
// past the edge proxy's ~100s timeout (a 502). So this returns a job id
// immediately and runs the extraction in the background (server-to-server, no
// proxy), stashing the result in Redis. The client polls .../extract/{job}.
func (s *server) handleExtractCatalog(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	cid := r.PathValue("id")
	var b struct {
		PDFBase64 string `json:"pdf_base64"`
		Segment   string `json:"segment"`
		Force     bool   `json:"force"` // bypass the content-addressed cache and force a fresh LLM extraction
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil || b.PDFBase64 == "" {
		http.Error(w, "pdf_base64 required", http.StatusBadRequest)
		return
	}
	var ok bool
	if err := s.pool.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM campaigns WHERE id=$1::uuid AND organization_id=$2)`, cid, a.OrgID).Scan(&ok); err != nil || !ok {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	jobID := uuid.NewString()
	key := "catalog_extract:" + a.OrgID + ":" + jobID

	// Content-addressed cache: the extracted rows depend only on the PDF bytes (+
	// segment hint), so a re-upload of the same pricelist reuses the prior result
	// and spends ZERO LLM tokens. Scoped per-org. LLM extraction of a big pricelist
	// is the expensive path, so this is the main token saver.
	sum := sha256.Sum256([]byte(b.PDFBase64))
	cacheKey := "catalog_extract_cache:" + a.OrgID + ":" + hex.EncodeToString(sum[:]) + ":" + b.Segment
	// Skip the cache on an explicit re-extract: re-uploading the same pricelist means
	// the caller wants a fresh read (the cached result may be stale or partial — e.g. a
	// prior run that missed a model), not a 30-day-old echo. A fresh run still repopulates
	// the cache below, so cross-campaign re-use of a good extraction is preserved.
	if !b.Force {
		if cached, err := s.rdb.Get(r.Context(), cacheKey).Result(); err == nil && cached != "" {
			done := fmt.Sprintf(`{"status":"done","warning":"cached","rows":%s}`, cached)
			_ = s.rdb.Set(r.Context(), key, done, 20*time.Minute).Err()
			writeJSON(w, map[string]any{"job_id": jobID, "status": "pending", "cached": true})
			return
		}
	}

	// Mark pending, then run the extraction detached from the request.
	_ = s.rdb.Set(r.Context(), key, `{"status":"pending"}`, 20*time.Minute).Err()
	// organization_id is forwarded so the ai-agent can attribute the extraction's
	// token spend in llm_usage — it is the only place the org is known on this path
	// (the ai-agent has no auth context of its own). A cache hit returns above and
	// spends no tokens, so it correctly records nothing.
	payload, _ := json.Marshal(map[string]any{
		"pdf_base64": b.PDFBase64, "segment": b.Segment, "organization_id": a.OrgID,
	})
	go s.runCatalogExtract(key, cacheKey, payload)
	writeJSON(w, map[string]any{"job_id": jobID, "status": "pending"})
}

// runCatalogExtract performs the ai-agent call in the background and writes the
// terminal state ({status:"done", rows,...} or {status:"error", error}) to Redis.
func (s *server) runCatalogExtract(key, cacheKey string, payload []byte) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	store := func(v any) {
		rb, _ := json.Marshal(v)
		_ = s.rdb.Set(context.Background(), key, string(rb), 20*time.Minute).Err()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.aiAgentURL+"/extract/catalog", bytes.NewReader(payload))
	if err != nil {
		store(map[string]any{"status": "error", "error": "internal error"})
		return
	}
	req.Header.Set("content-type", "application/json")
	req.Header.Set("accept", "text/event-stream")
	client := &http.Client{Timeout: 10 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		store(map[string]any{"status": "error", "error": "extraction service unavailable"})
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		store(map[string]any{"status": "error", "error": fmt.Sprintf("extraction failed (%d)", resp.StatusCode)})
		return
	}
	// The ai-agent streams SSE progress events; relay each to Redis so the client
	// poll sees live "rows extracted so far", then the final rows on done.
	sc := bufio.NewScanner(resp.Body)
	sc.Buffer(make([]byte, 0, 64*1024), 16*1024*1024) // the final "done" event carries all rows
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		var evt map[string]any
		if json.Unmarshal([]byte(strings.TrimSpace(line[5:])), &evt) != nil {
			continue
		}
		switch evt["type"] {
		case "progress":
			store(map[string]any{"status": "pending", "stage": "extracting", "rows_found": evt["rows"]})
		case "done":
			result := map[string]any{"status": "done"}
			for k, v := range evt {
				if k != "type" {
					result[k] = v
				}
			}
			store(result)
			// Cache the rows by content hash (30 days) so a re-upload of the same
			// pricelist skips the LLM entirely. Only cache a non-empty extraction
			// (never poison the cache with an empty/scanned result).
			if rows, ok := result["rows"].([]any); ok && len(rows) > 0 {
				if rb, err := json.Marshal(rows); err == nil {
					_ = s.rdb.Set(context.Background(), cacheKey, string(rb), 30*24*time.Hour).Err()
				}
			}
			return
		case "error":
			store(map[string]any{"status": "error", "error": evt["error"]})
			return
		}
	}
	if sc.Err() != nil {
		store(map[string]any{"status": "error", "error": "extraction stream error"})
		return
	}
	store(map[string]any{"status": "error", "error": "extraction ended unexpectedly"})
}

// GET /api/campaigns/{id}/catalog/extract/{job} — poll an extraction job. Returns
// {status:"pending"|"done"|"error"|"expired", rows?, warning?, error?}.
func (s *server) handleExtractCatalogStatus(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	key := "catalog_extract:" + a.OrgID + ":" + r.PathValue("job")
	val, err := s.rdb.Get(r.Context(), key).Result()
	if err != nil {
		writeJSON(w, map[string]any{"status": "expired"})
		return
	}
	w.Header().Set("content-type", "application/json")
	_, _ = w.Write([]byte(val))
}

// PATCH /api/campaigns/{id}/catalog/{row} — edit one catalog row in place.
func (s *server) handleUpdateCatalogRow(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	cid := r.PathValue("id")
	rowID := r.PathValue("row")
	var b struct {
		ItemName     string          `json:"item_name"`
		VariantName  string          `json:"variant_name"`
		LocationName string          `json:"location_name"`
		CategoryType string          `json:"category_type"`
		HeadlinePrice *float64       `json:"headline_price"`
		Attributes   json.RawMessage `json:"attributes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(b.ItemName) == "" {
		http.Error(w, "item_name required", http.StatusBadRequest)
		return
	}
	attrs := b.Attributes
	if len(attrs) == 0 {
		attrs = json.RawMessage("{}")
	}
	// Scope by campaign + org so one org can never edit another's rows.
	tag, err := s.pool.Exec(r.Context(),
		`UPDATE campaign_catalog cc
		    SET item_name=$4, variant_name=NULLIF($5,''), location_name=NULLIF($6,''),
		        category_type=NULLIF($7,''), headline_price=$8, attributes=$9::jsonb
		  FROM campaigns c
		 WHERE cc.id=$1::uuid AND cc.campaign_id=$2::uuid
		   AND c.id=cc.campaign_id AND c.organization_id=$3`,
		rowID, cid, a.OrgID, b.ItemName, b.VariantName, b.LocationName, b.CategoryType, b.HeadlinePrice, attrs)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	writeJSON(w, map[string]any{"updated": true})
}

// DELETE /api/campaigns/{id}/catalog/{row} — delete one catalog row.
func (s *server) handleDeleteCatalogRow(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	cid := r.PathValue("id")
	rowID := r.PathValue("row")
	tag, err := s.pool.Exec(r.Context(),
		`DELETE FROM campaign_catalog cc USING campaigns c
		  WHERE cc.id=$1::uuid AND cc.campaign_id=$2::uuid
		    AND c.id=cc.campaign_id AND c.organization_id=$3`,
		rowID, cid, a.OrgID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	writeJSON(w, map[string]any{"deleted": true})
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
