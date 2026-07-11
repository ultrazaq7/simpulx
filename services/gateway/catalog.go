package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
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
	// Mark pending, then run the extraction detached from the request.
	_ = s.rdb.Set(r.Context(), key, `{"status":"pending"}`, 20*time.Minute).Err()
	payload, _ := json.Marshal(map[string]any{"pdf_base64": b.PDFBase64, "segment": b.Segment})
	go s.runCatalogExtract(key, payload)
	writeJSON(w, map[string]any{"job_id": jobID, "status": "pending"})
}

// runCatalogExtract performs the ai-agent call in the background and writes the
// terminal state ({status:"done", rows,...} or {status:"error", error}) to Redis.
func (s *server) runCatalogExtract(key string, payload []byte) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
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
	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		store(map[string]any{"status": "error", "error": "extraction service unavailable"})
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		// Surface the ai-agent's real error (truncated) instead of a generic one,
		// so the user knows whether it's config, a bad PDF, or a service issue.
		msg := strings.TrimSpace(string(body))
		if len(msg) > 300 {
			msg = msg[:300]
		}
		if msg == "" {
			msg = fmt.Sprintf("extraction failed (%d)", resp.StatusCode)
		}
		store(map[string]any{"status": "error", "error": msg})
		return
	}
	// ai-agent body is {rows, warning?} (or {error}); merge it under status:done.
	var inner map[string]any
	if err := json.Unmarshal(body, &inner); err != nil {
		store(map[string]any{"status": "error", "error": "bad extraction response"})
		return
	}
	result := map[string]any{"status": "done"}
	for k, v := range inner {
		result[k] = v
	}
	store(result)
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
