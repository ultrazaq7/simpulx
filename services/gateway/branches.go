package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"
)

// ── Branches (a campaign / group can contain many branches) ───────────────────
// Each branch is a routing unit: its own coverage, ad sources and agents. Leads
// are matched to a branch by ad source, then round-robin assigned among the
// branch's agents (see routeToBranch). Branches are optional and backward
// compatible — a campaign with no branches routes at the campaign level.

// GET /api/campaigns/{id}/branches
func (s *server) handleListBranches(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	rows, err := s.queryMaps(r.Context(),
		`SELECT b.id::text AS id, b.name,
		        to_jsonb(b.ad_source_ids) AS ad_source_ids, b.lead_count,
		        COALESCE((SELECT jsonb_agg(ba.user_id::text) FROM branch_agents ba WHERE ba.branch_id=b.id), '[]'::jsonb) AS agent_ids,
		        COALESCE((SELECT jsonb_agg(ws.id::text) FROM web_api_sources ws WHERE ws.branch_id=b.id), '[]'::jsonb) AS web_source_ids
		   FROM campaign_branches b
		  WHERE b.campaign_id=$1 AND b.organization_id=$2
		  ORDER BY b.created_at`,
		r.PathValue("id"), a.OrgID,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

type branchInput struct {
	Name         string   `json:"name"`
	AdSourceIDs  []string `json:"ad_source_ids"`
	AgentIDs     []string `json:"agent_ids"`
	WebSourceIDs []string `json:"web_source_ids"`
}

// POST /api/campaigns/{id}/branches
func (s *server) handleCreateBranch(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	campaignID := r.PathValue("id")
	var b branchInput
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
		`INSERT INTO campaign_branches (organization_id, campaign_id, name, ad_source_ids)
		 SELECT $1, $2, $3, $4
		  WHERE EXISTS (SELECT 1 FROM campaigns WHERE id=$2 AND organization_id=$1)
		 RETURNING id::text`,
		a.OrgID, campaignID, b.Name, adSrc,
	).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "campaign not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if err := s.syncBranchAgents(r.Context(), id, b.AgentIDs); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if err := s.syncBranchWebSources(r.Context(), a.OrgID, id, b.WebSourceIDs); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.audit(r.Context(), a, "created", "branch", id, map[string]any{"name": b.Name, "campaign_id": campaignID})
	writeJSON(w, map[string]any{"id": id})
}

// PATCH /api/branches/{id}
func (s *server) handleUpdateBranch(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	id := r.PathValue("id")
	var b branchInput
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	tag, err := s.pool.Exec(r.Context(),
		`UPDATE campaign_branches SET
		   name = COALESCE(NULLIF($3,''), name),
		   ad_source_ids = COALESCE($4, ad_source_ids),
		   updated_at = now()
		 WHERE id=$1 AND organization_id=$2`,
		id, a.OrgID, b.Name, nilIfEmptySlice(b.AdSourceIDs),
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
		if err := s.syncBranchAgents(r.Context(), id, b.AgentIDs); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}
	if b.WebSourceIDs != nil {
		if err := s.syncBranchWebSources(r.Context(), a.OrgID, id, b.WebSourceIDs); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}
	writeJSON(w, map[string]any{"status": "updated"})
}

// DELETE /api/branches/{id}
func (s *server) handleDeleteBranch(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	tag, err := s.pool.Exec(r.Context(),
		`DELETE FROM campaign_branches WHERE id=$1 AND organization_id=$2`, r.PathValue("id"), a.OrgID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	s.audit(r.Context(), a, "deleted", "branch", r.PathValue("id"), nil)
	writeJSON(w, map[string]any{"status": "deleted"})
}

func (s *server) syncBranchAgents(ctx context.Context, branchID string, agentIDs []string) error {
	if _, err := s.pool.Exec(ctx, `DELETE FROM branch_agents WHERE branch_id=$1`, branchID); err != nil {
		return err
	}
	for _, uid := range agentIDs {
		if uid == "" {
			continue
		}
		if _, err := s.pool.Exec(ctx,
			`INSERT INTO branch_agents (branch_id, user_id) VALUES ($1,$2::uuid) ON CONFLICT DO NOTHING`,
			branchID, uid); err != nil {
			return err
		}
	}
	return nil
}

// syncBranchWebSources points the selected Web API sources at this branch and
// clears any that were previously this branch's but are no longer selected.
func (s *server) syncBranchWebSources(ctx context.Context, orgID, branchID string, sourceIDs []string) error {
	if _, err := s.pool.Exec(ctx, `UPDATE web_api_sources SET branch_id=NULL WHERE branch_id=$1`, branchID); err != nil {
		return err
	}
	for _, sid := range sourceIDs {
		if sid == "" {
			continue
		}
		if _, err := s.pool.Exec(ctx,
			`UPDATE web_api_sources SET branch_id=$1, updated_at=now() WHERE id=$2::uuid AND organization_id=$3`,
			branchID, sid, orgID); err != nil {
			return err
		}
	}
	return nil
}
