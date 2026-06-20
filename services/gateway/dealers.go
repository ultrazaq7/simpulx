package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"
)

// ── Dealers (a campaign / dealer-group can contain many dealers) ──────────────
// Each dealer is a routing unit: its own coverage, ad sources and agents. Leads
// are matched to a dealer by ad source, then round-robin assigned among the
// dealer's agents (see routeToDealer). Dealers are optional and backward
// compatible — a campaign with no dealers routes at the campaign level.

// GET /api/campaigns/{id}/dealers
func (s *server) handleListDealers(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	rows, err := s.queryMaps(r.Context(),
		`SELECT d.id::text AS id, d.name, d.coverage,
		        to_jsonb(d.ad_source_ids) AS ad_source_ids, d.lead_count,
		        COALESCE((SELECT jsonb_agg(da.user_id::text) FROM dealer_agents da WHERE da.dealer_id=d.id), '[]'::jsonb) AS agent_ids,
		        COALESCE((SELECT jsonb_agg(ws.id::text) FROM web_api_sources ws WHERE ws.dealer_id=d.id), '[]'::jsonb) AS web_source_ids
		   FROM campaign_dealers d
		  WHERE d.campaign_id=$1 AND d.organization_id=$2
		  ORDER BY d.created_at`,
		r.PathValue("id"), a.OrgID,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

type dealerInput struct {
	Name         string   `json:"name"`
	Coverage     string   `json:"coverage"`
	AdSourceIDs  []string `json:"ad_source_ids"`
	AgentIDs     []string `json:"agent_ids"`
	WebSourceIDs []string `json:"web_source_ids"`
}

// POST /api/campaigns/{id}/dealers
func (s *server) handleCreateDealer(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	campaignID := r.PathValue("id")
	var b dealerInput
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil || b.Name == "" {
		http.Error(w, "name required", http.StatusBadRequest)
		return
	}
	adSrc := b.AdSourceIDs
	if adSrc == nil {
		adSrc = []string{}
	}
	var id string
	err := s.pool.QueryRow(r.Context(),
		`INSERT INTO campaign_dealers (organization_id, campaign_id, name, coverage, ad_source_ids)
		 SELECT $1, $2, $3, $4, $5
		  WHERE EXISTS (SELECT 1 FROM campaigns WHERE id=$2 AND organization_id=$1)
		 RETURNING id::text`,
		a.OrgID, campaignID, b.Name, b.Coverage, adSrc,
	).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "campaign not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if err := s.syncDealerAgents(r.Context(), id, b.AgentIDs); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if err := s.syncDealerWebSources(r.Context(), a.OrgID, id, b.WebSourceIDs); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.audit(r.Context(), a, "created", "dealer", id, map[string]any{"name": b.Name, "campaign_id": campaignID})
	writeJSON(w, map[string]any{"id": id})
}

// PATCH /api/dealers/{id}
func (s *server) handleUpdateDealer(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	id := r.PathValue("id")
	var b dealerInput
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	tag, err := s.pool.Exec(r.Context(),
		`UPDATE campaign_dealers SET
		   name = COALESCE(NULLIF($3,''), name),
		   coverage = $4,
		   ad_source_ids = COALESCE($5, ad_source_ids),
		   updated_at = now()
		 WHERE id=$1 AND organization_id=$2`,
		id, a.OrgID, b.Name, b.Coverage, nilIfEmptySlice(b.AdSourceIDs),
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if b.AgentIDs != nil {
		if err := s.syncDealerAgents(r.Context(), id, b.AgentIDs); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}
	if b.WebSourceIDs != nil {
		if err := s.syncDealerWebSources(r.Context(), a.OrgID, id, b.WebSourceIDs); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}
	writeJSON(w, map[string]any{"status": "updated"})
}

// DELETE /api/dealers/{id}
func (s *server) handleDeleteDealer(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	tag, err := s.pool.Exec(r.Context(),
		`DELETE FROM campaign_dealers WHERE id=$1 AND organization_id=$2`, r.PathValue("id"), a.OrgID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	s.audit(r.Context(), a, "deleted", "dealer", r.PathValue("id"), nil)
	writeJSON(w, map[string]any{"status": "deleted"})
}

func (s *server) syncDealerAgents(ctx context.Context, dealerID string, agentIDs []string) error {
	if _, err := s.pool.Exec(ctx, `DELETE FROM dealer_agents WHERE dealer_id=$1`, dealerID); err != nil {
		return err
	}
	for _, uid := range agentIDs {
		if uid == "" {
			continue
		}
		if _, err := s.pool.Exec(ctx,
			`INSERT INTO dealer_agents (dealer_id, user_id) VALUES ($1,$2::uuid) ON CONFLICT DO NOTHING`,
			dealerID, uid); err != nil {
			return err
		}
	}
	return nil
}

// syncDealerWebSources points the selected Web API sources at this dealer and
// clears any that were previously this dealer's but are no longer selected.
func (s *server) syncDealerWebSources(ctx context.Context, orgID, dealerID string, sourceIDs []string) error {
	if _, err := s.pool.Exec(ctx, `UPDATE web_api_sources SET dealer_id=NULL WHERE dealer_id=$1`, dealerID); err != nil {
		return err
	}
	for _, sid := range sourceIDs {
		if sid == "" {
			continue
		}
		if _, err := s.pool.Exec(ctx,
			`UPDATE web_api_sources SET dealer_id=$1, updated_at=now() WHERE id=$2::uuid AND organization_id=$3`,
			dealerID, sid, orgID); err != nil {
			return err
		}
	}
	return nil
}
