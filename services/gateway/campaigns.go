package main

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/simpulx/v2/libs/go/events"
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
		        c.lead_count, c.monthly_budget, c.avg_deal_value, c.created_at, c.updated_at,
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
		        count(cv.id) FILTER (WHERE st.sort_order > 1 OR st.system_key LIKE 'lost%%') AS updated,
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
		        c.segment, c.brand, c.ai_auto_reply, c.ai_language, c.ai_dynamic_language, c.ai_smart_summary,
		        c.intake_form_id::text AS intake_form_id, c.followup_template_id::text AS followup_template_id, c.monthly_budget, c.avg_deal_value,
		        c.ai_style, c.followup_frequency,
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
	// AI assistant config.
	Segment           string `json:"segment"`
	Brand             string `json:"brand"`
	AIAutoReply       *bool  `json:"ai_auto_reply"`
	AILanguage        string `json:"ai_language"`         // id | en
	AIDynamicLanguage *bool  `json:"ai_dynamic_language"` // match the contact's language
	AISmartSummary    *bool    `json:"ai_smart_summary"`    // show the composer Smart Summary button
	IntakeFormID      string   `json:"intake_form_id"`
	FollowupTemplateID string  `json:"followup_template_id"` // approved template for out-of-window follow-ups ('' keep, 'none' clear)
	MonthlyBudget     *float64 `json:"monthly_budget"` // optional user-set monthly ad budget
	AvgDealValue      *float64 `json:"avg_deal_value"` // fallback deal value for revenue-influenced (when no catalog OTR match)
	// Per-campaign AI response tuning (persona/tone/length/goal/custom_rules). Raw
	// JSON so the gateway just stores/forwards it; the ai-agent interprets it.
	// nil = not sent (keep existing); {} = reset to defaults.
	AIStyle json.RawMessage `json:"ai_style"`
	// Auto follow-up cadence: off | low | normal | high ('' = keep existing).
	FollowupFrequency string `json:"followup_frequency"`
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
// POST /api/campaigns/{id}/clone — duplicate a campaign's full AI config + catalog
// + agent rotation into a new campaign in the SAME org. keywords + ad_source_ids
// are left empty (unique per-org routing/tracking params, so copying them would
// make two campaigns fight over the same leads); the clone routes nothing until
// its own keywords are set. Org-scoped: only clones a campaign the caller owns.
func (s *server) handleCloneCampaign(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	src := r.PathValue("id")
	tx, err := s.pool.Begin(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	var newID string
	err = tx.QueryRow(r.Context(),
		`INSERT INTO campaigns
		   (organization_id, name, dealer_name, routing_strategy, channel_id, calling_enabled,
		    segment, brand, ai_auto_reply, ai_language, ai_dynamic_language, intake_form_id, ai_smart_summary,
		    ai_style, covered_cities, followup_template_id, followup_frequency, monthly_budget, avg_deal_value,
		    keywords, ad_source_ids)
		 SELECT organization_id, left(name || ' (copy)', 200), dealer_name, routing_strategy, channel_id, calling_enabled,
		    segment, brand, ai_auto_reply, ai_language, ai_dynamic_language, intake_form_id, ai_smart_summary,
		    ai_style, covered_cities, followup_template_id, followup_frequency, monthly_budget, avg_deal_value,
		    '{}'::text[], '{}'::text[]
		   FROM campaigns WHERE id=$1 AND organization_id=$2
		 RETURNING id::text`, src, a.OrgID).Scan(&newID)
	if err != nil {
		http.Error(w, "clone failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if _, err := tx.Exec(r.Context(),
		`INSERT INTO campaign_catalog (campaign_id, segment, item_name, variant_name, location_name, category_type, headline_price, attributes)
		 SELECT $1, segment, item_name, variant_name, location_name, category_type, headline_price, attributes
		   FROM campaign_catalog WHERE campaign_id=$2`, newID, src); err != nil {
		http.Error(w, "clone catalog failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if _, err := tx.Exec(r.Context(),
		`INSERT INTO campaign_agents (campaign_id, user_id, in_rotation)
		 SELECT $1, user_id, in_rotation FROM campaign_agents WHERE campaign_id=$2
		 ON CONFLICT DO NOTHING`, newID, src); err != nil {
		http.Error(w, "clone agents failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.audit(r.Context(), a, "cloned", "campaign", newID, map[string]any{"source": src})
	writeJSON(w, map[string]any{"id": newID})
}

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
	if b.AILanguage == "" {
		b.AILanguage = "id"
	}
	err := s.pool.QueryRow(r.Context(),
		`INSERT INTO campaigns (organization_id, name, dealer_name, routing_strategy, ad_source_ids, keywords, channel_id, calling_enabled,
		                        segment, brand, ai_auto_reply, ai_language, ai_dynamic_language, intake_form_id, ai_smart_summary)
		 VALUES ($1,$2,NULLIF($3,''),$4,$5,$6,NULLIF(NULLIF($7,''),'none')::uuid,COALESCE($8,true),
		         NULLIF($9,''),NULLIF($10,''),COALESCE($11,false),$12,COALESCE($13,true),NULLIF(NULLIF($14,''),'none')::uuid,COALESCE($15,true)) RETURNING id::text`,
		a.OrgID, b.Name, b.DealerName, b.RoutingStrategy, b.AdSourceIDs, b.Keywords, b.ChannelID, b.CallingEnabled,
		b.Segment, b.Brand, b.AIAutoReply, b.AILanguage, b.AIDynamicLanguage, b.IntakeFormID, b.AISmartSummary,
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
		   dealer_name = COALESCE(NULLIF($4,''), dealer_name),
		   status = COALESCE(NULLIF($5,''), status),
		   routing_strategy = COALESCE(NULLIF($6,''), routing_strategy),
		   ad_source_ids = COALESCE($7, ad_source_ids),
		   keywords = COALESCE($8, keywords),
		   channel_id = COALESCE(NULLIF($9,'')::uuid, channel_id),
		   calling_enabled = COALESCE($10, calling_enabled),
		   segment = COALESCE(NULLIF($11,''), segment),
		   brand = COALESCE(NULLIF($12,''), brand),
		   ai_auto_reply = COALESCE($13, ai_auto_reply),
		   ai_language = COALESCE(NULLIF($14,''), ai_language),
		   ai_dynamic_language = COALESCE($15, ai_dynamic_language),
		   intake_form_id = CASE WHEN $16 = '' THEN intake_form_id WHEN $16 = 'none' THEN NULL ELSE $16::uuid END,
		   ai_smart_summary = COALESCE($17, ai_smart_summary),
		   monthly_budget = COALESCE($18, monthly_budget),
		   followup_template_id = CASE WHEN $19 = '' THEN followup_template_id WHEN $19 = 'none' THEN NULL ELSE $19::uuid END,
		   ai_style = COALESCE($20::jsonb, ai_style),
		   followup_frequency = COALESCE(NULLIF($21,''), followup_frequency),
		   avg_deal_value = COALESCE($22, avg_deal_value),
		   updated_at = now()
		 WHERE id=$1 AND organization_id=$2`,
		r.PathValue("id"), a.OrgID, b.Name, b.DealerName, b.Status, b.RoutingStrategy,
		nilIfEmptySlice(b.AdSourceIDs), nilIfEmptySlice(b.Keywords), b.ChannelID, b.CallingEnabled,
		b.Segment, b.Brand, b.AIAutoReply, b.AILanguage, b.AIDynamicLanguage, b.IntakeFormID, b.AISmartSummary,
		b.MonthlyBudget, b.FollowupTemplateID, nilIfEmptyJSON(b.AIStyle), b.FollowupFrequency, b.AvgDealValue,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	// Prompt versioning (P7): snapshot the AI style whenever it is changed, so its
	// evolution is auditable and an older version can be copied back. Best-effort.
	if b.AIStyle != nil {
		_, _ = s.pool.Exec(r.Context(),
			`INSERT INTO campaign_ai_history (campaign_id, ai_style, changed_by)
			 VALUES ($1, $2::jsonb, NULLIF($3,'')::uuid)`,
			r.PathValue("id"), nilIfEmptyJSON(b.AIStyle), a.UserID)
	}
	if b.AgentIDs != nil || b.SupervisorIDs != nil {
		if err := s.syncCampaignAgents(r.Context(), r.PathValue("id"), b.AgentIDs, b.SupervisorIDs); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}
	// Broadcast an AI-toggle change so connected clients update the affected
	// conversations' Smart Summary / Auto-reply flags in realtime (no reload).
	if b.AISmartSummary != nil || b.AIAutoReply != nil {
		_ = s.bus.Publish(events.SubjectCampaignUpdated, a.OrgID, events.CampaignUpdated{
			CampaignID:   r.PathValue("id"),
			SmartSummary: b.AISmartSummary,
			AutoReply:    b.AIAutoReply,
		})
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

// nilIfEmptyJSON returns nil for an absent/empty raw JSON body (so a COALESCE keeps
// the existing column), else the JSON string for a ::jsonb cast.
func nilIfEmptyJSON(j json.RawMessage) any {
	if len(j) == 0 {
		return nil
	}
	return string(j)
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
