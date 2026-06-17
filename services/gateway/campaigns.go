package main

import (
	"context"
	"encoding/json"
	"net/http"
)

// ── Campaigns (per-dealer sub-tenant on the shared OTO number) ──
// A campaign owns assigned agents + round-robin routing. Inbound leads
// are attributed by CTWA ad referral, Web API source, or first-message
// keyword (see messaging service + publisher ingest). No credits/billing.

// GET /api/campaigns
func (s *server) handleListCampaigns(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	rows, err := s.queryMaps(r.Context(),
		`SELECT c.id::text AS id, c.name, c.dealer_name, c.status, c.routing_strategy,
		        to_jsonb(c.ad_source_ids) AS ad_source_ids, to_jsonb(c.keywords) AS keywords,
		        c.lead_count, c.created_at,
		        c.channel_id::text AS channel_id, ch.name AS channel_name,
		        (SELECT count(*) FROM campaign_agents ca WHERE ca.campaign_id = c.id) AS agent_count,
		        COALESCE((SELECT jsonb_agg(u.full_name ORDER BY u.full_name)
		                    FROM campaign_agents ca JOIN users u ON u.id = ca.user_id
		                   WHERE ca.campaign_id = c.id), '[]'::jsonb) AS agent_names,
		        (SELECT count(*) FROM conversations cv WHERE cv.campaign_id = c.id) AS conversations
		   FROM campaigns c
		   LEFT JOIN channels ch ON ch.id = c.channel_id
		  WHERE c.organization_id = $1
		  ORDER BY c.created_at DESC`,
		a.OrgID,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

// GET /api/analytics/campaigns — per-campaign performance for the dashboard sub-tab.
func (s *server) handleCampaignAnalytics(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	rows, err := s.queryMaps(r.Context(),
		`SELECT c.id::text AS id, c.name, c.dealer_name, c.status, c.lead_count,
		        (SELECT count(*) FROM campaign_agents ca WHERE ca.campaign_id = c.id) AS agents,
		        count(cv.id) AS conversations,
		        count(cv.id) FILTER (WHERE cv.last_contact_message_at IS NOT NULL) AS replied,
		        count(cv.id) FILTER (WHERE cv.interest_level IN ('warm','hot')) AS intent,
		        count(cv.id) FILTER (WHERE cv.ai_stage IN ('high_intent','closing')) AS strong,
		        count(cv.id) FILTER (WHERE cv.ai_stage = 'won') AS won
		   FROM campaigns c
		   LEFT JOIN conversations cv ON cv.campaign_id = c.id
		  WHERE c.organization_id = $1
		  GROUP BY c.id
		  ORDER BY conversations DESC, c.created_at DESC`,
		a.OrgID,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

// GET /api/campaigns/{id} — includes assigned agent ids for editing.
func (s *server) handleGetCampaign(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	rows, err := s.queryMaps(r.Context(),
		`SELECT c.id::text AS id, c.name, c.dealer_name, c.status, c.routing_strategy,
		        to_jsonb(c.ad_source_ids) AS ad_source_ids, to_jsonb(c.keywords) AS keywords,
		        c.lead_count, c.channel_id::text AS channel_id,
		        COALESCE((SELECT jsonb_agg(ca.user_id::text) FROM campaign_agents ca WHERE ca.campaign_id = c.id), '[]'::jsonb) AS agent_ids
		   FROM campaigns c WHERE c.id = $1 AND c.organization_id = $2`,
		r.PathValue("id"), a.OrgID,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if len(rows) == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	writeJSON(w, rows[0])
}

type campaignInput struct {
	Name            string   `json:"name"`
	DealerName      string   `json:"dealer_name"`
	Status          string   `json:"status"`
	RoutingStrategy string   `json:"routing_strategy"`
	ChannelID       string   `json:"channel_id"`
	AdSourceIDs     []string `json:"ad_source_ids"`
	Keywords        []string `json:"keywords"`
	AgentIDs        []string `json:"agent_ids"`
}

// POST /api/campaigns
func (s *server) handleCreateCampaign(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var b campaignInput
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil || b.Name == "" {
		http.Error(w, "name required", http.StatusBadRequest)
		return
	}
	if b.RoutingStrategy == "" {
		b.RoutingStrategy = "round_robin"
	}
	var id string
	err := s.pool.QueryRow(r.Context(),
		`INSERT INTO campaigns (organization_id, name, dealer_name, routing_strategy, ad_source_ids, keywords, channel_id)
		 VALUES ($1,$2,NULLIF($3,''),$4,$5,$6,NULLIF($7,'')::uuid) RETURNING id::text`,
		a.OrgID, b.Name, b.DealerName, b.RoutingStrategy, b.AdSourceIDs, b.Keywords, b.ChannelID,
	).Scan(&id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if err := s.syncCampaignAgents(r.Context(), id, b.AgentIDs); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.audit(r.Context(), a, "created", "campaign", id, map[string]any{"name": b.Name, "dealer": b.DealerName})
	writeJSON(w, map[string]any{"id": id})
}

// PATCH /api/campaigns/{id}
func (s *server) handleUpdateCampaign(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var b campaignInput
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	tag, err := s.pool.Exec(r.Context(),
		`UPDATE campaigns SET
		   name = COALESCE(NULLIF($3,''), name),
		   dealer_name = COALESCE($4, dealer_name),
		   status = COALESCE(NULLIF($5,''), status),
		   routing_strategy = COALESCE(NULLIF($6,''), routing_strategy),
		   ad_source_ids = COALESCE($7, ad_source_ids),
		   keywords = COALESCE($8, keywords),
		   channel_id = NULLIF($9,'')::uuid,
		   updated_at = now()
		 WHERE id=$1 AND organization_id=$2`,
		r.PathValue("id"), a.OrgID, b.Name, b.DealerName, b.Status, b.RoutingStrategy,
		nilIfEmptySlice(b.AdSourceIDs), nilIfEmptySlice(b.Keywords), b.ChannelID,
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
		if err := s.syncCampaignAgents(r.Context(), r.PathValue("id"), b.AgentIDs); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}
	writeJSON(w, map[string]any{"status": "updated"})
}

// DELETE /api/campaigns/{id}
func (s *server) handleDeleteCampaign(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	tag, err := s.pool.Exec(r.Context(),
		`DELETE FROM campaigns WHERE id=$1 AND organization_id=$2`, r.PathValue("id"), a.OrgID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	writeJSON(w, map[string]any{"status": "deleted"})
}

func (s *server) syncCampaignAgents(ctx context.Context, campaignID string, agentIDs []string) error {
	if _, err := s.pool.Exec(ctx, `DELETE FROM campaign_agents WHERE campaign_id=$1`, campaignID); err != nil {
		return err
	}
	for _, uid := range agentIDs {
		if uid == "" {
			continue
		}
		if _, err := s.pool.Exec(ctx,
			`INSERT INTO campaign_agents (campaign_id, user_id) VALUES ($1,$2::uuid) ON CONFLICT DO NOTHING`,
			campaignID, uid); err != nil {
			return err
		}
	}
	return nil
}

// nilIfEmptySlice lets COALESCE keep the existing array when the client
// omits the field (sends null/empty) instead of wiping it.
func nilIfEmptySlice(s []string) any {
	if s == nil {
		return nil
	}
	return s
}

// routeToCampaign attributes a conversation to a campaign and assigns the
// next agent round-robin. Shared shape with messaging.routeToCampaign.
func (s *server) routeToCampaign(ctx context.Context, campaignID, convID string) {
	_, _ = s.pool.Exec(ctx,
		`WITH agents AS (SELECT user_id FROM campaign_agents WHERE campaign_id=$1 ORDER BY user_id),
		      pick AS (SELECT user_id FROM agents
		               OFFSET (SELECT rr_cursor % GREATEST((SELECT count(*) FROM agents),1) FROM campaigns WHERE id=$1)
		               LIMIT 1)
		 UPDATE conversations SET campaign_id=$1,
		        assigned_agent_id = COALESCE((SELECT user_id FROM pick), assigned_agent_id),
		        updated_at=now()
		  WHERE id=$2 AND campaign_id IS NULL`,
		campaignID, convID)
	_, _ = s.pool.Exec(ctx, `UPDATE campaigns SET rr_cursor=rr_cursor+1, lead_count=lead_count+1 WHERE id=$1`, campaignID)
}
