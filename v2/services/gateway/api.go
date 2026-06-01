package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/simpulx/v2/libs/go/events"
)

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

// cors membungkus handler dengan header CORS + menangani preflight.
func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization,Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// queryMaps menjalankan query dan mengembalikan baris sebagai []map (JSON-friendly).
func (s *server) queryMaps(ctx context.Context, sql string, args ...any) ([]map[string]any, error) {
	rows, err := s.pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToMap)
}

// ── GET /api/me ─────────────────────────────────────────────
func (s *server) handleMe(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	writeJSON(w, map[string]any{"id": a.UserID, "org_id": a.OrgID, "role": a.Role, "name": a.Name})
}

// ── GET /api/conversations?status= ──────────────────────────
func (s *server) handleListConversations(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	status := r.URL.Query().Get("status")

	// Role-based visibility:
	//  - admin/owner : every conversation in the org.
	//  - manager     : conversations in the campaigns they belong to
	//                  (campaign_agents), plus any unassigned conversation.
	//  - agent       : only conversations assigned to them.
	// $1=org, $2=status, $3=user id (used by manager/agent filters).
	visibility := ""
	switch a.Role {
	case "admin", "owner":
		// no extra filter
	case "manager":
		visibility = ` AND (cv.assigned_agent_id IS NULL
		                     OR cv.campaign_id IN (SELECT campaign_id FROM campaign_agents WHERE user_id = $3))`
	default: // agent (and any unknown role) -> own conversations only
		visibility = ` AND cv.assigned_agent_id = $3`
	}

	args := []any{a.OrgID, status}
	if visibility != "" {
		args = append(args, a.UserID)
	}

	rows, err := s.queryMaps(r.Context(),
		`SELECT cv.id::text AS id, cv.status, cv.channel, cv.is_bot_active,
		        cv.unread_count, cv.last_message_at, cv.last_message_preview,
		        cv.interest_level, cv.ai_stage,
		        cv.car_brand, cv.car_model, cv.city, cv.purchase_timeframe, cv.lost_reason,
		        ct.full_name AS contact_name, ct.phone AS contact_phone,
		        cv.assigned_agent_id::text AS assigned_agent_id,
		        u.full_name AS agent_name,
		        cv.stage_id::text AS stage_id, s.name AS stage_name,
		        cv.disposition_id::text AS disposition_id, d.name AS disposition_name,
		        cv.campaign_id::text AS campaign_id, cmp.name AS campaign_name
		   FROM conversations cv
		   JOIN contacts ct ON ct.id = cv.contact_id
		   LEFT JOIN users u ON u.id = cv.assigned_agent_id
		   LEFT JOIN stages s ON s.id = cv.stage_id
		   LEFT JOIN dispositions d ON d.id = cv.disposition_id
		   LEFT JOIN campaigns cmp ON cmp.id = cv.campaign_id
		  WHERE cv.organization_id = $1
		    AND ($2 = '' OR cv.status = $2)`+visibility+`
		  ORDER BY cv.last_message_at DESC NULLS LAST
		  LIMIT 100`,
		args...,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

// canAccessConversation enforces the same role-based visibility as the inbox
// list query, but for a single conversation (id-addressable endpoints). Without
// this, an agent who knows another agent's conversation id could read or mutate
// it directly (IDOR). Rules:
//   - admin/owner : any conversation in their org
//   - manager     : conversations in their campaigns (campaign_agents) or unassigned
//   - agent       : only conversations assigned to them
//
// Returns (allowed, found). found=false means the conversation does not exist in
// the org at all (-> 404); allowed=false with found=true means it exists but the
// caller may not touch it (-> 403, also surfaced as 404 to avoid leaking existence).
func (s *server) canAccessConversation(ctx context.Context, a authInfo, convID string) (allowed, found bool) {
	var assignedAgent *string
	var campaignID *string
	err := s.pool.QueryRow(ctx,
		`SELECT assigned_agent_id::text, campaign_id::text
		   FROM conversations WHERE id = $1 AND organization_id = $2`,
		convID, a.OrgID,
	).Scan(&assignedAgent, &campaignID)
	if err != nil {
		return false, false // not found in this org
	}
	switch a.Role {
	case "admin", "owner":
		return true, true
	case "manager":
		if assignedAgent == nil {
			return true, true // unassigned is visible to managers
		}
		if campaignID == nil {
			return false, true
		}
		var inCampaign bool
		_ = s.pool.QueryRow(ctx,
			`SELECT true FROM campaign_agents WHERE campaign_id = $1::uuid AND user_id = $2`,
			*campaignID, a.UserID,
		).Scan(&inCampaign)
		return inCampaign, true
	default: // agent
		return assignedAgent != nil && *assignedAgent == a.UserID, true
	}
}

// guardConversation runs canAccessConversation and writes the appropriate error
// response. Returns true when the caller may proceed.
func (s *server) guardConversation(w http.ResponseWriter, r *http.Request, convID string) bool {
	a, _ := authFrom(r.Context())
	allowed, _ := s.canAccessConversation(r.Context(), a, convID)
	if !allowed {
		// Hide existence from unauthorized callers: always 404, never 403.
		http.Error(w, "not found", http.StatusNotFound)
		return false
	}
	return true
}

// ── GET /api/conversations/{id}/messages ────────────────────
func (s *server) handleGetMessages(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	convID := r.PathValue("id")
	if !s.guardConversation(w, r, convID) {
		return
	}
	limitStr := r.URL.Query().Get("limit")
	limit := 50
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 500 {
		limit = l
	}
	cursor := r.URL.Query().Get("cursor") // message ID as cursor

	var query string
	var args []any
	if cursor == "" {
		query = `SELECT id::text AS id, direction, sender_type, type, body, media_url, status, created_at
		           FROM messages
		          WHERE conversation_id = $1 AND organization_id = $2
		          ORDER BY created_at DESC, id DESC LIMIT $3`
		args = []any{convID, a.OrgID, limit}
	} else {
		query = `SELECT id::text AS id, direction, sender_type, type, body, media_url, status, created_at
		           FROM messages
		          WHERE conversation_id = $1 AND organization_id = $2
		            AND created_at <= (SELECT created_at FROM messages WHERE id = $3)
		            AND id != $3
		          ORDER BY created_at DESC, id DESC LIMIT $4`
		args = []any{convID, a.OrgID, cursor, limit}
	}

	rows, err := s.queryMaps(r.Context(), query, args...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Reverse rows to chronological ASC for the frontend
	for i, j := 0, len(rows)-1; i < j; i, j = i+1, j-1 {
		rows[i], rows[j] = rows[j], rows[i]
	}

	var nextCursor *string
	// Because rows are reversed, the OLDEST message is now at index 0.
	if len(rows) == limit {
		cid := rows[0]["id"].(string)
		nextCursor = &cid
	}

	// reset unread saat agen membuka percakapan (hanya di fetch halaman pertama)
	if cursor == "" {
		_, _ = s.pool.Exec(r.Context(),
			`UPDATE conversations SET unread_count = 0 WHERE id = $1 AND organization_id = $2`, convID, a.OrgID)
	}

	writeJSON(w, map[string]any{
		"data":        rows,
		"next_cursor": nextCursor,
	})
}

// ── POST /api/conversations/{id}/messages {body,type,media_url} ──
func (s *server) handleSendMessage(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	convID := r.PathValue("id")
	var body struct {
		Body     string `json:"body"`
		Type     string `json:"type"`
		MediaURL string `json:"media_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || (body.Body == "" && body.MediaURL == "") {
		http.Error(w, "body or media_url required", http.StatusBadRequest)
		return
	}
	msgType := body.Type
	if msgType == "" {
		msgType = "text"
	}
	if !s.guardConversation(w, r, convID) {
		return
	}
	err := s.bus.Publish(events.SubjectMessageOutbound, a.OrgID, events.MessageOutbound{
		ConversationID: convID,
		SenderType:     "agent",
		SenderID:       a.UserID,
		Type:           msgType,
		Body:           body.Body,
		MediaURL:       body.MediaURL,
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"status": "queued"})
}

// ── POST /api/uploads (multipart "file") -> object storage ──
func (s *server) handleUpload(w http.ResponseWriter, r *http.Request) {
	if s.storage == nil {
		http.Error(w, "storage not configured", http.StatusServiceUnavailable)
		return
	}
	if err := r.ParseMultipartForm(25 << 20); err != nil {
		http.Error(w, "upload too large or malformed", http.StatusBadRequest)
		return
	}
	file, hdr, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "file required", http.StatusBadRequest)
		return
	}
	defer file.Close()
	ct := hdr.Header.Get("Content-Type")
	if ct == "" {
		ct = "application/octet-stream"
	}
	key := "media/" + uuid.NewString() + filepath.Ext(hdr.Filename)
	url, err := s.storage.put(r.Context(), key, ct, file, hdr.Size)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"url": url, "type": mediaCategory(ct), "name": hdr.Filename})
}

func mediaCategory(ct string) string {
	switch {
	case strings.HasPrefix(ct, "image/"):
		return "image"
	case strings.HasPrefix(ct, "audio/"):
		return "audio"
	case strings.HasPrefix(ct, "video/"):
		return "video"
	default:
		return "document"
	}
}

// ── POST /api/conversations/{id}/bot {active} ───────────────
func (s *server) handleToggleBot(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	convID := r.PathValue("id")
	var body struct {
		Active bool `json:"active"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if !s.guardConversation(w, r, convID) {
		return
	}
	_, err := s.pool.Exec(r.Context(),
		`UPDATE conversations SET is_bot_active = $3, updated_at = now()
		  WHERE id = $1 AND organization_id = $2`, convID, a.OrgID, body.Active)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"is_bot_active": body.Active})
}

// ── GET /api/stages & /api/dispositions ─────────────────────
func (s *server) handleListStages(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	rows, err := s.queryMaps(r.Context(),
		`SELECT id::text AS id, name FROM stages WHERE organization_id=$1 ORDER BY sort_order`, a.OrgID)
	if err != nil { http.Error(w, err.Error(), http.StatusInternalServerError); return }
	writeJSON(w, rows)
}

func (s *server) handleListDispositions(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	rows, err := s.queryMaps(r.Context(),
		`SELECT id::text AS id, name, category FROM dispositions WHERE organization_id=$1 ORDER BY sort_order`, a.OrgID)
	if err != nil { http.Error(w, err.Error(), http.StatusInternalServerError); return }
	writeJSON(w, rows)
}

// ── POST /api/conversations/{id}/calls (Call Tracking) ────────
func (s *server) handleTrackCall(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	convID := r.PathValue("id")
	
	var body struct {
		DurationSeconds int `json:"duration_seconds"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if !s.guardConversation(w, r, convID) {
		return
	}

	_, err := s.pool.Exec(r.Context(),
		`UPDATE conversations
		 SET call_attempts = call_attempts + 1,
		     total_call_duration = total_call_duration + $3,
		     updated_at = now()
		 WHERE id=$1 AND organization_id=$2`,
		convID, a.OrgID, body.DurationSeconds)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	
	writeJSON(w, map[string]any{"status": "recorded", "duration": body.DurationSeconds})
}

// ── PATCH /api/conversations/{id} (manual override; locks AI) ─
func (s *server) handlePatchConversation(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	convID := r.PathValue("id")
	var b struct {
		StageID       *string `json:"stage_id"`
		DispositionID *string `json:"disposition_id"`
		InterestLevel *string `json:"interest_level"`
		Status        *string `json:"status"`
		LostReason    *string `json:"lost_reason"`
		UnreadCount   *int    `json:"unread_count"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if !s.guardConversation(w, r, convID) {
		return
	}
	_, err := s.pool.Exec(r.Context(),
		`UPDATE conversations SET
		   stage_id = COALESCE(NULLIF($3,'')::uuid, stage_id),
		   disposition_id = COALESCE(NULLIF($4,'')::uuid, disposition_id),
		   interest_level = COALESCE(NULLIF($5,''), interest_level),
		   status = COALESCE(NULLIF($6,''), status),
		   lost_reason = COALESCE(NULLIF($7,''), lost_reason),
		   unread_count = COALESCE($8, unread_count),
		   classification_locked = true,
		   updated_at = now()
		 WHERE id=$1 AND organization_id=$2`,
		convID, a.OrgID, derefStr(b.StageID), derefStr(b.DispositionID), derefStr(b.InterestLevel), derefStr(b.Status), derefStr(b.LostReason), b.UnreadCount)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"status": "updated", "locked": true})
}

func derefStr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// ── GET /api/agents ─────────────────────────────────────────
func (s *server) handleListAgents(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	rows, err := s.queryMaps(r.Context(),
		`SELECT u.id::text AS id, u.full_name, u.is_online,
		        (SELECT count(*) FROM conversations c
		           WHERE c.assigned_agent_id = u.id AND c.status <> 'closed') AS open_count
		   FROM users u
		  WHERE u.organization_id = $1 AND u.role IN ('agent','admin')
		  ORDER BY u.full_name`,
		a.OrgID,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

// ── GET /api/knowledge ──────────────────────────────────────
func (s *server) handleListKnowledge(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	rows, err := s.queryMaps(r.Context(),
		`SELECT ks.id::text AS id, ks.title, ks.source_type, ks.status, ks.created_at,
		        (SELECT count(*) FROM knowledge_chunks kc WHERE kc.source_id = ks.id) AS chunks
		   FROM knowledge_sources ks
		  WHERE ks.organization_id = $1
		  ORDER BY ks.created_at DESC`,
		a.OrgID,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

// ── POST /api/knowledge {title, content} -> proxy knowledge svc
func (s *server) handleAddKnowledge(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var body struct {
		Title   string `json:"title"`
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	payload, _ := json.Marshal(map[string]any{
		"organization_id": a.OrgID, "title": body.Title, "content": body.Content, "source_type": "text",
	})
	s.proxyJSON(w, r.Context(), http.MethodPost, s.knowledgeURL+"/ingest", payload)
}

// ── GET/PUT /api/ai-agent ───────────────────────────────────
func (s *server) handleGetAIAgent(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	rows, err := s.queryMaps(r.Context(),
		`SELECT id::text AS id, name, system_prompt, model,
		        temperature::float8 AS temperature, mode,
		        handoff_threshold::float8 AS handoff_threshold, is_active
		   FROM ai_agents WHERE organization_id = $1 ORDER BY created_at LIMIT 1`,
		a.OrgID,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if len(rows) == 0 {
		writeJSON(w, nil)
		return
	}
	writeJSON(w, rows[0])
}

func (s *server) handleUpdateAIAgent(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var body struct {
		Name             string   `json:"name"`
		SystemPrompt     string   `json:"system_prompt"`
		Model            string   `json:"model"`
		Mode             string   `json:"mode"`
		Temperature      *float64 `json:"temperature"`
		HandoffThreshold *float64 `json:"handoff_threshold"`
		IsActive         *bool    `json:"is_active"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	_, err := s.pool.Exec(r.Context(),
		`UPDATE ai_agents SET
		   name = COALESCE(NULLIF($2,''), name),
		   system_prompt = COALESCE(NULLIF($3,''), system_prompt),
		   model = COALESCE(NULLIF($4,''), model),
		   mode = COALESCE(NULLIF($5,''), mode),
		   temperature = COALESCE($6, temperature),
		   handoff_threshold = COALESCE($7, handoff_threshold),
		   is_active = COALESCE($8, is_active),
		   updated_at = now()
		 WHERE organization_id = $1`,
		a.OrgID, body.Name, body.SystemPrompt, body.Model, body.Mode,
		body.Temperature, body.HandoffThreshold, body.IsActive,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.handleGetAIAgent(w, r)
}

// ── GET /api/stats (analytics ringkas) ──────────────────────
func (s *server) handleStats(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	rows, err := s.queryMaps(r.Context(),
		`SELECT
		   (SELECT count(*) FROM conversations WHERE organization_id=$1 AND status<>'closed') AS active,
		   (SELECT count(*) FROM conversations WHERE organization_id=$1 AND status<>'closed' AND assigned_agent_id IS NULL) AS unassigned,
		   (SELECT count(*) FROM conversations WHERE organization_id=$1 AND is_bot_active) AS bot_active,
		   (SELECT count(*) FROM messages WHERE organization_id=$1) AS messages,
		   (SELECT count(*) FROM contacts WHERE organization_id=$1) AS contacts,
		   (SELECT count(*) FROM users WHERE organization_id=$1 AND role IN ('agent','admin')) AS team,
		   (SELECT count(*) FROM ai_runs WHERE organization_id=$1 AND decision='reply') AS ai_replies,
		   (SELECT count(*) FROM ai_runs WHERE organization_id=$1 AND decision='handoff') AS handoffs,
		   (SELECT count(*) FROM broadcasts WHERE organization_id=$1) AS broadcasts`,
		a.OrgID,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows[0])
}

// ── GET /api/analytics (lead-intelligence dashboard) ────────
func (s *server) handleAnalytics(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	org := a.OrgID
	ctx := r.Context()

	funnel, err := s.queryMaps(ctx,
		`SELECT count(*) AS total,
		        count(*) FILTER (WHERE last_contact_message_at IS NOT NULL) AS replied,
		        count(*) FILTER (WHERE interest_level IN ('warm','hot')) AS intent,
		        count(*) FILTER (WHERE ai_stage IN ('high_intent','closing')) AS strong_intent,
		        count(*) FILTER (WHERE interest_level='hot') AS hot,
		        count(*) FILTER (WHERE interest_level='warm') AS warm,
		        count(*) FILTER (WHERE interest_level='cold') AS cold,
		        count(*) FILTER (WHERE interest_level IS NULL) AS unknown,
		        COALESCE(sum(followup_count), 0)::int AS followups,
		        COALESCE(sum(call_attempts), 0)::int AS call_attempts,
		        COALESCE(sum(total_call_duration), 0)::int AS call_duration_sec
		   FROM conversations WHERE organization_id=$1`, org)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	stages, _ := s.queryMaps(ctx,
		`SELECT s.name, s.system_key, s.sort_order,
		        count(cv.id) AS count
		   FROM stages s
		   LEFT JOIN conversations cv ON cv.stage_id = s.id
		  WHERE s.organization_id=$1
		  GROUP BY s.id ORDER BY s.sort_order`, org)

	categories, _ := s.queryMaps(ctx,
		`SELECT cat AS category, count(*) AS count
		   FROM conversations cv,
		        jsonb_array_elements_text(COALESCE(cv.metadata->'intent_categories','[]'::jsonb)) AS cat
		  WHERE cv.organization_id=$1
		  GROUP BY cat ORDER BY count DESC`, org)

	tiers, _ := s.queryMaps(ctx,
		`WITH c AS (
		   SELECT cv.id, count(m.id) FILTER (WHERE m.direction='inbound' AND m.sender_type='contact') AS replies
		     FROM conversations cv LEFT JOIN messages m ON m.conversation_id=cv.id
		    WHERE cv.organization_id=$1 GROUP BY cv.id)
		 SELECT count(*) FILTER (WHERE replies=0) AS cold,
		        count(*) FILTER (WHERE replies=1) AS lukewarm,
		        count(*) FILTER (WHERE replies BETWEEN 2 AND 4) AS warm,
		        count(*) FILTER (WHERE replies BETWEEN 5 AND 9) AS engaged,
		        count(*) FILTER (WHERE replies>=10) AS hot
		   FROM c`, org)

	agents, _ := s.queryMaps(ctx,
		`WITH fr AS (
		   SELECT conversation_id, min(created_at) AS t_c FROM messages
		    WHERE organization_id=$1 AND direction='inbound' AND sender_type='contact'
		    GROUP BY conversation_id),
		 rt AS (
		   SELECT fr.conversation_id, EXTRACT(EPOCH FROM (min(m.created_at)-fr.t_c))/60.0 AS rt_min
		     FROM fr JOIN messages m ON m.conversation_id=fr.conversation_id
		            AND m.direction='outbound' AND m.created_at>fr.t_c AND m.organization_id=$1
		    GROUP BY fr.conversation_id, fr.t_c)
		 SELECT u.full_name AS agent,
		        count(cv.id) AS leads,
		        count(cv.id) FILTER (WHERE cv.last_contact_message_at IS NOT NULL) AS replied,
		        count(cv.id) FILTER (WHERE cv.interest_level IN ('warm','hot')) AS intent,
		        count(cv.id) FILTER (WHERE cv.ai_stage IN ('high_intent','closing')) AS strong,
		        count(cv.id) FILTER (WHERE cv.ai_stage='won') AS won,
		        COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY rt.rt_min),0)::float8 AS median_rt_min,
		        COALESCE(avg(rt.rt_min),0)::float8 AS avg_rt_min,
		        COALESCE(avg(CASE WHEN rt.rt_min<=5 THEN 100.0 ELSE 0 END) FILTER (WHERE rt.rt_min IS NOT NULL),0)::float8 AS within_5_pct
		   FROM users u
		   LEFT JOIN conversations cv ON cv.assigned_agent_id=u.id AND cv.organization_id=$1
		   LEFT JOIN rt ON rt.conversation_id=cv.id
		  WHERE u.organization_id=$1 AND u.role IN ('agent','admin')
		  GROUP BY u.id, u.full_name ORDER BY leads DESC`, org)

	daily, _ := s.queryMaps(ctx,
		`SELECT to_char(date_trunc('day', created_at),'YYYY-MM-DD') AS day,
		        count(*) AS leads,
		        count(*) FILTER (WHERE last_contact_message_at IS NOT NULL) AS replied
		   FROM conversations WHERE organization_id=$1 AND created_at > now() - interval '14 days'
		  GROUP BY 1 ORDER BY 1`, org)

	// Response time = customer's first reply -> agent's next outgoing message.
	rt, _ := s.queryMaps(ctx,
		`WITH fr AS (
		   SELECT conversation_id, min(created_at) AS t_c
		     FROM messages
		    WHERE organization_id=$1 AND direction='inbound' AND sender_type='contact'
		    GROUP BY conversation_id),
		 rt AS (
		   SELECT fr.conversation_id,
		          EXTRACT(EPOCH FROM (min(m.created_at) - fr.t_c))/60.0 AS rt_min
		     FROM fr JOIN messages m ON m.conversation_id=fr.conversation_id
		            AND m.direction='outbound' AND m.created_at > fr.t_c
		    WHERE m.organization_id=$1
		    GROUP BY fr.conversation_id, fr.t_c)
		 SELECT COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY rt_min),0)::float8 AS median_min,
		        COALESCE(avg(rt_min),0)::float8 AS avg_min,
		        COALESCE(avg(CASE WHEN rt_min<=5  THEN 100.0 ELSE 0 END),0)::float8 AS within_5_min_pct,
		        COALESCE(avg(CASE WHEN rt_min<=60 THEN 100.0 ELSE 0 END),0)::float8 AS within_1_hr_pct,
		        count(*) AS leads_with_rt,
		        count(*) FILTER (WHERE rt_min < 1)                       AS d_lt1,
		        count(*) FILTER (WHERE rt_min >= 1   AND rt_min < 5)     AS d_1_5,
		        count(*) FILTER (WHERE rt_min >= 5   AND rt_min < 15)    AS d_5_15,
		        count(*) FILTER (WHERE rt_min >= 15  AND rt_min < 60)    AS d_15_60,
		        count(*) FILTER (WHERE rt_min >= 60  AND rt_min < 240)   AS d_1_4h,
		        count(*) FILTER (WHERE rt_min >= 240 AND rt_min < 1440)  AS d_4_24h,
		        count(*) FILTER (WHERE rt_min >= 1440)                   AS d_gt24h
		   FROM rt`, org)

	var junk int64
	_ = s.pool.QueryRow(ctx,
		`SELECT count(*) FROM conversations cv JOIN dispositions d ON d.id=cv.disposition_id
		  WHERE cv.organization_id=$1 AND d.system_key='off_topic'`, org).Scan(&junk)

	writeJSON(w, map[string]any{
		"funnel":        funnel[0],
		"stages":        stages,
		"categories":    categories,
		"tiers":         tiers[0],
		"agents":        agents,
		"daily":         daily,
		"response_time": rt[0],
		"junk":          junk,
	})
}

// ── GET /api/broadcasts ─────────────────────────────────────
func (s *server) handleListBroadcasts(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	rows, err := s.queryMaps(r.Context(),
		`SELECT b.id::text AS id, b.name, b.status, b.total_recipients, b.sent_count, b.failed_count,
		        b.created_at, b.completed_at, b.scheduled_at, t.name AS template_name
		   FROM broadcasts b
		   LEFT JOIN message_templates t ON t.id = b.template_id
		  WHERE b.organization_id=$1 ORDER BY b.created_at DESC LIMIT 50`,
		a.OrgID,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

// ── POST /api/broadcasts {name, body?, template_id?, scheduled_at?, audience?} ──
func (s *server) handleCreateBroadcast(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var body struct {
		Name        string `json:"name"`
		Body        string `json:"body"`
		TemplateID  string `json:"template_id"`
		ScheduledAt string `json:"scheduled_at"` // RFC3339; empty = send now
		Audience    string `json:"audience"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Name == "" {
		http.Error(w, "name required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()

	// When a template is chosen, render its body (sample vars) so the
	// existing mock send path delivers real text.
	var templateID *string
	if body.TemplateID != "" {
		templateID = &body.TemplateID
		if rendered, ok := s.renderTemplate(ctx, a.OrgID, body.TemplateID); ok {
			body.Body = rendered
		}
	}
	if body.Body == "" {
		http.Error(w, "body or template required", http.StatusBadRequest)
		return
	}
	if body.Audience == "" {
		body.Audience = "all"
	}

	// Scheduled in the future => hold (a scheduler publishes it when due).
	var scheduledAt *time.Time
	status := "queued"
	if body.ScheduledAt != "" {
		if t, err := time.Parse(time.RFC3339, body.ScheduledAt); err == nil && t.After(time.Now()) {
			scheduledAt = &t
			status = "scheduled"
		}
	}

	// channel aktif org (boleh kosong di dev)
	var channelID *string
	_ = s.pool.QueryRow(ctx,
		`SELECT id::text FROM channels WHERE organization_id=$1 AND is_active ORDER BY created_at LIMIT 1`,
		a.OrgID).Scan(&channelID)

	var bid string
	err := s.pool.QueryRow(ctx,
		`INSERT INTO broadcasts (organization_id, name, body, channel_id, template_id, audience, scheduled_at, status, created_by)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id::text`,
		a.OrgID, body.Name, body.Body, channelID, templateID, body.Audience, scheduledAt, status, a.UserID,
	).Scan(&bid)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// snapshot penerima = semua kontak org yang punya nomor
	tag, err := s.pool.Exec(ctx,
		`INSERT INTO broadcast_recipients (broadcast_id, organization_id, contact_id, phone)
		 SELECT $1, organization_id, id, phone FROM contacts
		  WHERE organization_id=$2 AND phone IS NOT NULL`,
		bid, a.OrgID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	total := tag.RowsAffected()
	_, _ = s.pool.Exec(ctx, `UPDATE broadcasts SET total_recipients=$2 WHERE id=$1`, bid, total)

	s.audit(ctx, a, "created", "broadcast", bid, map[string]any{"name": body.Name, "status": status})

	// Only fire immediately when not scheduled for later.
	if status == "queued" {
		if err := s.bus.Publish(events.SubjectBroadcastRequested, a.OrgID, events.BroadcastRequested{BroadcastID: bid}); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}
	writeJSON(w, map[string]any{"id": bid, "total_recipients": total, "status": status})
}

// renderTemplate substitutes {{1}},{{2}}... in a template body with its
// sample variables. Returns false if the template isn't found.
func (s *server) renderTemplate(ctx context.Context, orgID, templateID string) (string, bool) {
	var bodyText string
	var vars []string
	err := s.pool.QueryRow(ctx,
		`SELECT body, COALESCE((SELECT array_agg(value) FROM jsonb_array_elements_text(variables)), '{}')
		   FROM message_templates WHERE id=$1 AND organization_id=$2`,
		templateID, orgID).Scan(&bodyText, &vars)
	if err != nil {
		return "", false
	}
	out := bodyText
	for i, v := range vars {
		out = strings.ReplaceAll(out, "{{"+strconv.Itoa(i+1)+"}}", v)
	}
	return out, true
}

// ── Quick replies ───────────────────────────────────────────
func (s *server) handleListQuickReplies(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	rows, err := s.queryMaps(r.Context(),
		`SELECT id::text AS id, shortcut, title, body, created_at
		   FROM quick_replies WHERE organization_id=$1 ORDER BY shortcut`, a.OrgID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

func (s *server) handleCreateQuickReply(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var b struct {
		Shortcut string `json:"shortcut"`
		Title    string `json:"title"`
		Body     string `json:"body"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil || b.Shortcut == "" || b.Body == "" {
		http.Error(w, "shortcut & body required", http.StatusBadRequest)
		return
	}
	var id string
	err := s.pool.QueryRow(r.Context(),
		`INSERT INTO quick_replies (organization_id, shortcut, title, body, created_by)
		 VALUES ($1,$2,$3,$4,$5)
		 ON CONFLICT (organization_id, shortcut) DO UPDATE SET title=EXCLUDED.title, body=EXCLUDED.body
		 RETURNING id::text`,
		a.OrgID, b.Shortcut, b.Title, b.Body, a.UserID).Scan(&id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"id": id})
}

func (s *server) handleDeleteQuickReply(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	_, err := s.pool.Exec(r.Context(),
		`DELETE FROM quick_replies WHERE id=$1 AND organization_id=$2`, r.PathValue("id"), a.OrgID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"status": "deleted"})
}

// ── Internal notes ──────────────────────────────────────────
func (s *server) handleListNotes(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	convID := r.PathValue("id")
	if !s.guardConversation(w, r, convID) {
		return
	}
	rows, err := s.queryMaps(r.Context(),
		`SELECT n.id::text AS id, n.body, n.created_at, u.full_name AS author
		   FROM internal_notes n LEFT JOIN users u ON u.id=n.user_id
		  WHERE n.conversation_id=$1 AND n.organization_id=$2
		  ORDER BY n.created_at`, convID, a.OrgID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

func (s *server) handleAddNote(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	convID := r.PathValue("id")
	var b struct {
		Body string `json:"body"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil || b.Body == "" {
		http.Error(w, "body required", http.StatusBadRequest)
		return
	}
	if !s.guardConversation(w, r, convID) {
		return
	}
	var id string
	err := s.pool.QueryRow(r.Context(),
		`INSERT INTO internal_notes (organization_id, conversation_id, user_id, body)
		 VALUES ($1,$2,$3,$4) RETURNING id::text`,
		a.OrgID, convID, a.UserID, b.Body).Scan(&id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"id": id})
}

// ── Contacts ────────────────────────────────────────────────
func (s *server) handleListContacts(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	rows, err := s.queryMaps(r.Context(),
		`SELECT ct.id::text AS id, ct.full_name, ct.phone, ct.source_channel, ct.created_at,
		        lc.interest_level, ls.name AS stage_name, lc.last_message_at
		   FROM contacts ct
		   LEFT JOIN LATERAL (
		     SELECT interest_level, stage_id, last_message_at
		       FROM conversations WHERE contact_id=ct.id
		      ORDER BY last_message_at DESC NULLS LAST LIMIT 1
		   ) lc ON true
		   LEFT JOIN stages ls ON ls.id = lc.stage_id
		  WHERE ct.organization_id=$1
		  ORDER BY ct.created_at DESC LIMIT 200`, a.OrgID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

// ── Proxy assign/close ke conversation service ──────────────
func (s *server) handleAssign(w http.ResponseWriter, r *http.Request) {
	convID := r.PathValue("id")
	if !s.guardConversation(w, r, convID) {
		return
	}
	bodyBytes, _ := io.ReadAll(r.Body)
	s.proxyJSON(w, r.Context(), http.MethodPost, s.conversationURL+"/conversations/"+convID+"/assign", bodyBytes)
}

func (s *server) handleClose(w http.ResponseWriter, r *http.Request) {
	convID := r.PathValue("id")
	if !s.guardConversation(w, r, convID) {
		return
	}
	bodyBytes, _ := io.ReadAll(r.Body)
	s.proxyJSON(w, r.Context(), http.MethodPost, s.conversationURL+"/conversations/"+convID+"/close", bodyBytes)
}

// proxyJSON meneruskan request JSON ke service internal dan menyalin respons.
func (s *server) proxyJSON(w http.ResponseWriter, ctx context.Context, method, url string, body []byte) {
	reqCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, method, url, bytes.NewReader(body))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.httpClient.Do(req)
	if err != nil {
		http.Error(w, "upstream error: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

// ── GET /api/llm-models ─────────────────────────────────────────
func (s *server) handleListLLMModels(w http.ResponseWriter, r *http.Request) {
	apiKey := os.Getenv("ANTHROPIC_API_KEY")
	if apiKey == "" {
		http.Error(w, "ANTHROPIC_API_KEY is not configured", http.StatusServiceUnavailable)
		return
	}

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, "https://api.anthropic.com/v1/models", nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, "Failed to fetch models from Anthropic: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		http.Error(w, "Anthropic API error: "+string(body), resp.StatusCode)
		return
	}

	var result struct {
		Data []struct {
			ID          string `json:"id"`
			Type        string `json:"type"`
			DisplayName string `json:"display_name"`
			CreatedAt   string `json:"created_at"`
		} `json:"data"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		http.Error(w, "Failed to decode Anthropic response: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Transform to a simpler structure for frontend
	type ModelItem struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	
	models := make([]ModelItem, 0, len(result.Data))
	for _, m := range result.Data {
		name := m.DisplayName
		if name == "" {
			name = m.ID
		}
		// prepend identifier to name if it's different so we can see the id
		if name != m.ID {
			name = name + " (" + m.ID + ")"
		}
		models = append(models, ModelItem{ID: m.ID, Name: name})
	}

	writeJSON(w, models)
}
