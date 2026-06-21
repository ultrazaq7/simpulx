package main

import (
	"context"
	"encoding/json"
	"net/http"
)

// ── Campaigns (per-branch sub-tenant on the shared OTO number) ──
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
		        c.channel_id::text AS channel_id, ch.name AS channel_name, c.calling_enabled,
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
		`WITH fr AS (
		   SELECT conversation_id, min(created_at) AS t_c FROM messages
		    WHERE organization_id=$1 AND direction='inbound' AND sender_type='contact'
		    GROUP BY conversation_id),
		 rt AS (
		   SELECT fr.conversation_id, EXTRACT(EPOCH FROM (min(m.created_at)-fr.t_c))/60.0 AS rt_min
		     FROM fr JOIN messages m ON m.conversation_id=fr.conversation_id
		            AND m.direction='outbound' AND m.sender_type='agent'
		            AND m.created_at>fr.t_c AND m.organization_id=$1
		    GROUP BY fr.conversation_id, fr.t_c),
		 ar AS (
		   SELECT conversation_id, avg(gap) AS avg_gap FROM (
		     SELECT conversation_id, sender_type,
		            EXTRACT(EPOCH FROM (created_at - lag(created_at) OVER (PARTITION BY conversation_id ORDER BY created_at)))/60.0 AS gap,
		            lag(sender_type) OVER (PARTITION BY conversation_id ORDER BY created_at) AS prev_type
		       FROM messages WHERE organization_id=$1) z
		    WHERE sender_type='agent' AND prev_type='contact' AND gap >= 0
		    GROUP BY conversation_id)
		 SELECT c.id::text AS id, c.name,
		        (SELECT count(*) FROM campaign_agents ca WHERE ca.campaign_id = c.id) AS agents,
		        count(DISTINCT cv.contact_id) AS leads,
		        count(cv.id) AS total_chat,
		        count(cv.id) FILTER (WHERE cv.last_agent_message_at IS NOT NULL) AS replied,
		        COALESCE(avg(rt.rt_min),0)::float8 AS avg_rt_min,
		        COALESCE(avg(ar.avg_gap),0)::float8 AS avg_resp_min,
		        COALESCE(avg(CASE WHEN rt.rt_min<=5 THEN 100.0 ELSE 0 END) FILTER (WHERE rt.rt_min IS NOT NULL),0)::float8 AS within_5_pct,
		        COALESCE(sum(cv.call_attempts), 0)::int AS call_attempts,
		        COALESCE(sum(cv.total_call_duration), 0)::int AS call_duration_sec,
		        count(cv.id) FILTER (WHERE st.sort_order > 1) AS updated,
		        count(cv.id) FILTER (WHERE st.system_key='contacted') AS contacted,
		        count(cv.id) FILTER (WHERE st.system_key='qualified') AS qualified,
		        count(cv.id) FILTER (WHERE st.system_key='appointment') AS appointment,
		        count(cv.id) FILTER (WHERE st.system_key='test_drive') AS negotiation,
		        count(cv.id) FILTER (WHERE st.system_key='booking') AS purchase
		   FROM campaigns c
		   LEFT JOIN conversations cv ON cv.campaign_id = c.id
		   LEFT JOIN stages st ON st.id=cv.stage_id
		   LEFT JOIN rt ON rt.conversation_id=cv.id
		   LEFT JOIN ar ON ar.conversation_id=cv.id
		  WHERE c.organization_id = $1
		  GROUP BY c.id, c.name
		  ORDER BY leads DESC, c.created_at DESC`,
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
		        c.lead_count, c.channel_id::text AS channel_id, c.calling_enabled,
		        COALESCE((SELECT jsonb_agg(ca.user_id::text) FROM campaign_agents ca WHERE ca.campaign_id = c.id AND ca.in_rotation), '[]'::jsonb) AS agent_ids,
		        COALESCE((SELECT jsonb_agg(ca.user_id::text) FROM campaign_agents ca WHERE ca.campaign_id = c.id AND NOT ca.in_rotation), '[]'::jsonb) AS supervisor_ids
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
	SupervisorIDs   []string `json:"supervisor_ids"` // members for oversight only (no round-robin)
	CallingEnabled  *bool    `json:"calling_enabled"`
}

// keywordsConflict returns the first keyword already claimed by ANOTHER campaign
// in the org (empty if none). A keyword maps a first message to a single campaign,
// so sharing it misroutes (resolveCampaignByKeyword picks one arbitrary campaign).
func (s *server) keywordsConflict(ctx context.Context, orgID, selfCampaignID string, keywords []string) string {
	if len(keywords) == 0 {
		return ""
	}
	var dup string
	err := s.pool.QueryRow(ctx,
		`SELECT x FROM unnest($1::text[]) AS x
		  WHERE x <> '' AND EXISTS (
		    SELECT 1 FROM campaigns c
		     WHERE c.organization_id=$2 AND ($3='' OR c.id <> $3::uuid)
		       AND lower(x) IN (SELECT lower(k) FROM unnest(c.keywords) k))
		  LIMIT 1`,
		keywords, orgID, selfCampaignID).Scan(&dup)
	if err != nil {
		return ""
	}
	return dup
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
	if dup := s.keywordsConflict(r.Context(), a.OrgID, "", b.Keywords); dup != "" {
		http.Error(w, "Keyword \""+dup+"\" is already used by another campaign", http.StatusConflict)
		return
	}
	var id string
	err := s.pool.QueryRow(r.Context(),
		`INSERT INTO campaigns (organization_id, name, dealer_name, routing_strategy, ad_source_ids, keywords, channel_id, calling_enabled)
		 VALUES ($1,$2,NULLIF($3,''),$4,$5,$6,NULLIF($7,'')::uuid,COALESCE($8,true)) RETURNING id::text`,
		a.OrgID, b.Name, b.DealerName, b.RoutingStrategy, b.AdSourceIDs, b.Keywords, b.ChannelID, b.CallingEnabled,
	).Scan(&id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if err := s.syncCampaignAgents(r.Context(), id, b.AgentIDs, b.SupervisorIDs); err != nil {
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
	if b.Keywords != nil {
		if dup := s.keywordsConflict(r.Context(), a.OrgID, r.PathValue("id"), b.Keywords); dup != "" {
			http.Error(w, "Keyword \""+dup+"\" is already used by another campaign", http.StatusConflict)
			return
		}
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
		   calling_enabled = COALESCE($10, calling_enabled),
		   updated_at = now()
		 WHERE id=$1 AND organization_id=$2`,
		r.PathValue("id"), a.OrgID, b.Name, b.DealerName, b.Status, b.RoutingStrategy,
		nilIfEmptySlice(b.AdSourceIDs), nilIfEmptySlice(b.Keywords), b.ChannelID, b.CallingEnabled,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if b.AgentIDs != nil || b.SupervisorIDs != nil {
		if err := s.syncCampaignAgents(r.Context(), r.PathValue("id"), b.AgentIDs, b.SupervisorIDs); err != nil {
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

// syncCampaignAgents rewrites a campaign's roster: agentIDs join the round-robin
// rotation (in_rotation=true), supervisorIDs are oversight-only (in_rotation=false,
// they see the campaign but never get assigned leads). Agents win if listed twice.
func (s *server) syncCampaignAgents(ctx context.Context, campaignID string, agentIDs, supervisorIDs []string) error {
	if _, err := s.pool.Exec(ctx, `DELETE FROM campaign_agents WHERE campaign_id=$1`, campaignID); err != nil {
		return err
	}
	ins := func(ids []string, rotation bool) error {
		for _, uid := range ids {
			if uid == "" {
				continue
			}
			if _, err := s.pool.Exec(ctx,
				`INSERT INTO campaign_agents (campaign_id, user_id, in_rotation) VALUES ($1,$2::uuid,$3) ON CONFLICT DO NOTHING`,
				campaignID, uid, rotation); err != nil {
				return err
			}
		}
		return nil
	}
	if err := ins(agentIDs, true); err != nil {
		return err
	}
	return ins(supervisorIDs, false)
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
		`WITH pick AS (
		         SELECT ca.user_id FROM campaign_agents ca JOIN users u ON u.id=ca.user_id
		          WHERE ca.campaign_id=$1 AND ca.in_rotation AND u.is_deleted=false AND u.status='active'
		          ORDER BY (SELECT count(*) FROM conversations cc WHERE cc.assigned_agent_id=ca.user_id AND cc.status<>'closed') ASC, ca.user_id
		          LIMIT 1)
		 UPDATE conversations SET campaign_id=$1,
		        assigned_agent_id = COALESCE((SELECT user_id FROM pick), assigned_agent_id),
		        updated_at=now()
		  WHERE id=$2 AND campaign_id IS NULL`,
		campaignID, convID)
	_, _ = s.pool.Exec(ctx, `UPDATE campaigns SET rr_cursor=rr_cursor+1, lead_count=lead_count+1 WHERE id=$1`, campaignID)
}

// routeToBranch attributes a conversation to a branch (and its parent campaign)
// and round-robin assigns the next agent from that branch's roster. Mirrors
// routeToCampaign but on campaign_branches.rr_cursor + branch_agents.
func (s *server) routeToBranch(ctx context.Context, branchID, convID string) {
	_, _ = s.pool.Exec(ctx,
		`WITH d AS (SELECT campaign_id FROM campaign_branches WHERE id=$1),
		      pick AS (
		         SELECT ba.user_id FROM branch_agents ba JOIN users u ON u.id=ba.user_id
		          WHERE ba.branch_id=$1 AND ba.in_rotation AND u.is_deleted=false AND u.status='active'
		          ORDER BY (SELECT count(*) FROM conversations cc WHERE cc.assigned_agent_id=ba.user_id AND cc.status<>'closed') ASC, ba.user_id
		          LIMIT 1)
		 UPDATE conversations SET branch_id=$1,
		        campaign_id = (SELECT campaign_id FROM d),
		        assigned_agent_id = COALESCE((SELECT user_id FROM pick), assigned_agent_id),
		        updated_at=now()
		  WHERE id=$2 AND campaign_id IS NULL`,
		branchID, convID)
	_, _ = s.pool.Exec(ctx, `UPDATE campaign_branches SET rr_cursor=rr_cursor+1, lead_count=lead_count+1 WHERE id=$1`, branchID)
}
