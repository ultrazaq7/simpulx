package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/simpulx/v2/libs/go/events"
)

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
	_ = json.NewEncoder(w).Encode(v)
}

// cors membungkus handler dengan header CORS + menangani preflight.
func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization,Content-Type,Cache-Control,Pragma")
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
	// Read name/email live from the DB so a verified email change (or a renamed
	// profile) shows up without needing a fresh login; the JWT claims can be stale.
	name, email := a.Name, ""
	_ = s.pool.QueryRow(r.Context(), `SELECT full_name, email FROM users WHERE id=$1`, a.UserID).Scan(&name, &email)
	writeJSON(w, map[string]any{"id": a.UserID, "org_id": a.OrgID, "role": a.Role, "name": name, "email": email})
}

// ── GET /api/conversations?status= ──────────────────────────
func (s *server) handleListConversations(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	status := r.URL.Query().Get("status")

	// Role-based visibility:
	//  - admin/owner : every conversation in the org.
	//  - manager     : strictly the campaigns/branches they belong to (campaign_agents
	//                  / branch_agents). Unassigned leads in their scope still carry
	//                  campaign_id/branch_id so they show; unrouted leads (no
	//                  campaign/branch) are admin/owner only.
	//  - agent       : only conversations assigned to them.
	// $1=org, $2=status, $3=user id (used by manager/agent filters).
	visibility := ""
	switch a.Role {
	case "admin", "owner":
		// no extra filter
	case "manager":
		visibility = " AND " + managerScope("cv", 3)
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
		        (CASE 
		           WHEN cv.last_agent_message_at IS NOT NULL AND (cv.last_contact_message_at IS NULL OR cv.last_agent_message_at >= cv.last_contact_message_at) THEN 'agent' 
		           ELSE 'contact' 
		         END) AS last_message_direction,
		        cv.interest_level, cv.ai_stage,
		        cv.car_brand, cv.car_model, cv.city, cv.purchase_timeframe, cv.lost_reason,
		        cv.lead_summary, cv.suggested_action, cv.suggested_action_reason,
		        cv.suggested_action_confidence, cv.lead_score, cv.call_attempts,
		        ct.full_name AS contact_name, ct.phone AS contact_phone,
		        cv.assigned_agent_id::text AS assigned_agent_id,
		        u.full_name AS agent_name,
		        cv.stage_id::text AS stage_id, s.name AS stage_name,
		        cv.disposition_id::text AS disposition_id, d.name AS disposition_name,
		        cv.campaign_id::text AS campaign_id, cmp.name AS campaign_name,
		        COALESCE(ch.calling_enabled, false) AND COALESCE(cmp.calling_enabled, true) AS calling_enabled,
		        cv.contact_id::text AS contact_id, COALESCE(ct.tags, '{}') AS tags,
		        cv.snoozed_until
		   FROM conversations cv
		   JOIN contacts ct ON ct.id = cv.contact_id
		   LEFT JOIN users u ON u.id = cv.assigned_agent_id
		   LEFT JOIN stages s ON s.id = cv.stage_id
		   LEFT JOIN dispositions d ON d.id = cv.disposition_id
		   LEFT JOIN campaigns cmp ON cmp.id = cv.campaign_id
		   LEFT JOIN channels ch ON ch.id = cmp.channel_id
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
//   - manager     : strictly conversations in their campaigns/branches (campaign_agents
//                   / branch_agents); unrouted leads are admin/owner only
//   - agent       : only conversations assigned to them
//
// Returns (allowed, found). found=false means the conversation does not exist in
// the org at all (-> 404); allowed=false with found=true means it exists but the
// caller may not touch it (-> 403, also surfaced as 404 to avoid leaking existence).
func (s *server) canAccessConversation(ctx context.Context, a authInfo, convID string) (allowed, found bool) {
	var assignedAgent *string
	var campaignID, branchID *string
	err := s.pool.QueryRow(ctx,
		`SELECT assigned_agent_id::text, campaign_id::text, branch_id::text
		   FROM conversations WHERE id = $1 AND organization_id = $2`,
		convID, a.OrgID,
	).Scan(&assignedAgent, &campaignID, &branchID)
	if err != nil {
		return false, false // not found in this org
	}
	switch a.Role {
	case "admin", "owner":
		return true, true
	case "manager":
		// Visible only if the manager belongs to the conversation's campaign or branch.
		// An unassigned lead in their scope still carries campaign_id/branch_id, so it
		// matches; an unrouted lead (no campaign/branch) does not.
		var ok bool
		_ = s.pool.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM campaign_agents WHERE user_id=$1 AND campaign_id=$2::uuid)
			     OR EXISTS(SELECT 1 FROM branch_agents WHERE user_id=$1 AND branch_id=$3::uuid)`,
			a.UserID, campaignID, branchID,
		).Scan(&ok)
		return ok, true
	default: // agent
		return assignedAgent != nil && *assignedAgent == a.UserID, true
	}
}

// managerScope returns the SQL predicate limiting a manager to conversations in
// the campaigns (campaign_agents) and branches (branch_agents) they belong to.
// alias is the conversations table alias ("" for none, e.g. "cv" or "lc"); idx is
// the positional placeholder holding the manager's user id (referenced twice).
func managerScope(alias string, idx int) string {
	p := ""
	if alias != "" {
		p = alias + "."
	}
	return fmt.Sprintf("(%scampaign_id IN (SELECT campaign_id FROM campaign_agents WHERE user_id = $%d)"+
		" OR %sbranch_id IN (SELECT branch_id FROM branch_agents WHERE user_id = $%d))", p, idx, p, idx)
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

// ── GET /api/conversations/{id}/messages/search?q=... ────────────
func (s *server) handleSearchMessages(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	convID := r.PathValue("id")
	if !s.guardConversation(w, r, convID) {
		return
	}
	
	q := r.URL.Query().Get("q")
	if len(q) < 2 {
		writeJSON(w, map[string]any{"data": []any{}})
		return
	}

	query := `SELECT id::text AS id, direction, sender_type, type, body, media_url, status, created_at
	            FROM messages
	           WHERE conversation_id = $1 AND organization_id = $2
	             AND body ILIKE $3
	           ORDER BY created_at DESC LIMIT 50`
	           
	rows, err := s.queryMaps(r.Context(), query, convID, a.OrgID, "%"+q+"%")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, map[string]any{"data": rows})
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
	// Hard-cap the request body so a huge upload returns a clean 413 instead of
	// spooling unbounded to disk / appearing to hang. 110MB covers WhatsApp's
	// largest media (documents up to 100MB) with headroom.
	const maxUpload = 110 << 20
	r.Body = http.MaxBytesReader(w, r.Body, maxUpload)
	if err := r.ParseMultipartForm(25 << 20); err != nil {
		var mbe *http.MaxBytesError
		if errors.As(err, &mbe) {
			http.Error(w, "file too large (max 100MB)", http.StatusRequestEntityTooLarge)
			return
		}
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
	// Append the original filename so it's preserved in the URL for downstream parsing
	// e.g. "media/<uuid>-MyDocument.pdf"
	
	var uploadReader io.Reader = file
	var uploadSize int64 = hdr.Size

	if strings.HasSuffix(hdr.Filename, ".webm") && strings.HasPrefix(ct, "audio/") {
		tmpIn, err := os.CreateTemp("", "in-*.webm")
		if err == nil {
			io.Copy(tmpIn, file)
			tmpIn.Close()
			tmpOutPath := tmpIn.Name() + ".ogg"
			cmd := exec.Command("ffmpeg", "-y", "-i", tmpIn.Name(), "-c:a", "libopus", "-b:a", "128k", tmpOutPath)
			if err := cmd.Run(); err == nil {
				if outF, err := os.Open(tmpOutPath); err == nil {
					defer outF.Close()
					if st, err := outF.Stat(); err == nil {
						uploadReader = outF
						uploadSize = st.Size()
						hdr.Filename = strings.TrimSuffix(hdr.Filename, ".webm") + ".ogg"
						ct = "audio/ogg"
					}
				}
				defer os.Remove(tmpOutPath)
			}
			defer os.Remove(tmpIn.Name())
		}
	}

	key := "media/" + uuid.NewString() + "-" + strings.ReplaceAll(hdr.Filename, " ", "-")
	urlStr, err := s.storage.put(r.Context(), key, ct, uploadReader, uploadSize)
	if err == nil {
		// Import net/url is needed but we can just use url.QueryEscape
		urlStr += "?name=" + url.QueryEscape(hdr.Filename)
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"url": urlStr, "type": mediaCategory(ct), "name": hdr.Filename})
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
	
	query := `SELECT u.id::text AS id, u.full_name, u.email, u.is_online,
		        (SELECT count(*) FROM conversations c
		           WHERE c.assigned_agent_id = u.id AND c.status <> 'closed') AS open_count
		   FROM users u
		  WHERE u.organization_id = $1 AND u.is_deleted = false AND u.role IN ('agent','admin', 'manager') `
	
	args := []any{a.OrgID}

	if a.Role == "manager" {
		query += ` AND u.id IN (
		    SELECT user_id FROM campaign_agents WHERE campaign_id IN (SELECT campaign_id FROM campaign_agents WHERE user_id = $2)
		    UNION
		    SELECT user_id FROM branch_agents WHERE branch_id IN (SELECT branch_id FROM branch_agents WHERE user_id = $2))`
		args = append(args, a.UserID)
	} else if a.Role == "agent" {
		query += ` AND u.id = $2`
		args = append(args, a.UserID)
	}

	query += ` ORDER BY u.full_name`

	rows, err := s.queryMaps(r.Context(), query, args...)
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
	camp := r.URL.Query().Get("campaign_id")
	
	campFilter := ""
	args := []any{a.OrgID}
	
	if camp != "" {
		camps := strings.Split(camp, ",")
		args = append(args, camps)
		campFilter = fmt.Sprintf(" AND campaign_id = ANY($%d)", len(args))
	}

	if a.Role == "agent" {
		args = append(args, a.UserID)
		campFilter += fmt.Sprintf(" AND assigned_agent_id = $%d", len(args))
	} else if a.Role == "manager" {
		args = append(args, a.UserID)
		campFilter += " AND " + managerScope("", len(args))
	}
	if ch := r.URL.Query().Get("channel_id"); ch != "" {
		args = append(args, strings.Split(ch, ","))
		campFilter += fmt.Sprintf(" AND channel_id = ANY($%d)", len(args))
	}
	if ag := r.URL.Query().Get("agent_id"); ag != "" {
		args = append(args, strings.Split(ag, ","))
		campFilter += fmt.Sprintf(" AND assigned_agent_id = ANY($%d)", len(args))
	}

	query := fmt.Sprintf(`SELECT
		   (SELECT count(*) FROM conversations WHERE organization_id=$1%s AND status<>'closed') AS active,
		   (SELECT count(*) FROM conversations WHERE organization_id=$1%s AND status<>'closed' AND assigned_agent_id IS NULL) AS unassigned,
		   (SELECT count(*) FROM conversations WHERE organization_id=$1%s AND is_bot_active) AS bot_active,
		   (SELECT count(*) FROM messages WHERE organization_id=$1) AS messages,
		   (SELECT count(*) FROM contacts WHERE organization_id=$1) AS contacts,
		   (SELECT count(*) FROM users WHERE organization_id=$1 AND role IN ('agent','admin', 'manager')) AS team,
		   (SELECT count(*) FROM ai_runs WHERE organization_id=$1 AND decision='reply') AS ai_replies,
		   (SELECT count(*) FROM ai_runs WHERE organization_id=$1 AND decision='handoff') AS handoffs,
		   (SELECT count(*) FROM broadcasts WHERE organization_id=$1) AS broadcasts`, campFilter, campFilter, campFilter)

	rows, err := s.queryMaps(r.Context(), query, args...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows[0])
}

// ── GET /api/dashboard/cards (agent action-center counts) ───
// Role-scoped the same way as stats/analytics: agent=own, manager=own campaigns,
// admin/owner=org-wide. Powers the clickable action cards on the agent dashboard.
func (s *server) handleDashboardCards(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	camp := r.URL.Query().Get("campaign_id")

	campFilter := ""
	args := []any{a.OrgID}

	if camp != "" {
		camps := strings.Split(camp, ",")
		args = append(args, camps)
		campFilter = fmt.Sprintf(" AND campaign_id = ANY($%d)", len(args))
	}

	if a.Role == "agent" {
		args = append(args, a.UserID)
		campFilter += fmt.Sprintf(" AND assigned_agent_id = $%d", len(args))
	} else if a.Role == "manager" {
		args = append(args, a.UserID)
		campFilter += " AND " + managerScope("", len(args))
	}

	query := fmt.Sprintf(`SELECT
		   count(*) FILTER (WHERE status<>'closed') AS open,
		   count(*) FILTER (WHERE status<>'closed' AND interest_level='hot') AS hot,
		   count(*) FILTER (WHERE status<>'closed' AND interest_level IN ('hot','warm') AND unread_count>0) AS follow_up,
		   count(*) FILTER (WHERE status<>'closed' AND interest_level='hot' AND COALESCE(call_attempts,0)=0) AS need_call,
		   count(*) FILTER (WHERE status<>'closed' AND unread_count>0) AS unread
		 FROM conversations WHERE organization_id=$1%s`, campFilter)

	rows, err := s.queryMaps(r.Context(), query, args...)
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
	camp := r.URL.Query().Get("campaign_id")
	// Workspace timezone so a date-range filter matches local days, not UTC days.
	orgTz := "Asia/Jakarta"
	_ = s.pool.QueryRow(ctx, `SELECT COALESCE(NULLIF(settings->>'timezone',''),'Asia/Jakarta') FROM organizations WHERE id=$1`, org).Scan(&orgTz)

	campFilterCv := ""
	campFilter := ""
	args := []any{org}
	
	if camp != "" {
		camps := strings.Split(camp, ",")
		args = append(args, camps)
		campFilterCv = fmt.Sprintf(" AND cv.campaign_id = ANY($%d)", len(args))
		campFilter = fmt.Sprintf(" AND campaign_id = ANY($%d)", len(args))
	}

	if a.Role == "agent" {
		args = append(args, a.UserID)
		campFilterCv += fmt.Sprintf(" AND cv.assigned_agent_id = $%d", len(args))
		campFilter += fmt.Sprintf(" AND assigned_agent_id = $%d", len(args))
	} else if a.Role == "manager" {
		args = append(args, a.UserID)
		campFilterCv += " AND " + managerScope("cv", len(args))
		campFilter += " AND " + managerScope("", len(args))
	}
	if ch := r.URL.Query().Get("channel_id"); ch != "" {
		args = append(args, strings.Split(ch, ","))
		campFilterCv += fmt.Sprintf(" AND cv.channel_id = ANY($%d)", len(args))
		campFilter += fmt.Sprintf(" AND channel_id = ANY($%d)", len(args))
	}
	if ag := r.URL.Query().Get("agent_id"); ag != "" {
		args = append(args, strings.Split(ag, ","))
		campFilterCv += fmt.Sprintf(" AND cv.assigned_agent_id = ANY($%d)", len(args))
		campFilter += fmt.Sprintf(" AND assigned_agent_id = ANY($%d)", len(args))
	}
	// Custom date range on lead creation, evaluated in the workspace timezone so
	// the boundaries line up with the user's local days (inclusive of 'to').
	fromS, toS := r.URL.Query().Get("from"), r.URL.Query().Get("to")
	if fromS != "" || toS != "" {
		args = append(args, orgTz)
		tzIdx := len(args)
		if fromS != "" {
			args = append(args, fromS)
			campFilterCv += fmt.Sprintf(" AND cv.created_at >= ($%d::date AT TIME ZONE $%d)", len(args), tzIdx)
			campFilter += fmt.Sprintf(" AND created_at >= ($%d::date AT TIME ZONE $%d)", len(args), tzIdx)
		}
		if toS != "" {
			args = append(args, toS)
			campFilterCv += fmt.Sprintf(" AND cv.created_at < (($%d::date + 1) AT TIME ZONE $%d)", len(args), tzIdx)
			campFilter += fmt.Sprintf(" AND created_at < (($%d::date + 1) AT TIME ZONE $%d)", len(args), tzIdx)
		}
	}

	// Accurate, unambiguous definitions:
	//  replied = the AGENT responded at least once (last_agent_message_at)
	//  engaged = the LEAD/customer responded at least once (last_contact_message_at)
	//  won     = reached the FINAL pipeline stage (Booking = max sort_order)
	//  lost    = disposition CATEGORY 'lost' (terminal negative, set with a reason)
	funnel, err := s.queryMaps(ctx,
		fmt.Sprintf(`SELECT count(*) AS total,
		        count(*) FILTER (WHERE cv.last_agent_message_at IS NOT NULL) AS replied,
		        count(*) FILTER (WHERE cv.last_contact_message_at IS NOT NULL) AS engaged,
		        count(*) FILTER (WHERE cv.interest_level IN ('warm','hot')) AS intent,
		        count(*) FILTER (WHERE cv.interest_level='hot') AS hot,
		        count(*) FILTER (WHERE cv.interest_level='warm') AS warm,
		        count(*) FILTER (WHERE cv.interest_level='cold') AS cold,
		        count(*) FILTER (WHERE cv.interest_level IS NULL) AS unknown,
		        count(*) FILTER (WHERE st.sort_order = (SELECT max(sort_order) FROM stages WHERE organization_id=$1)) AS won,
		        count(*) FILTER (WHERE d.category='lost') AS lost,
		        COALESCE(sum(cv.followup_count), 0)::int AS followups,
		        COALESCE(sum(cv.call_attempts), 0)::int AS call_attempts,
		        COALESCE(sum(cv.total_call_duration), 0)::int AS call_duration_sec
		   FROM conversations cv
		   LEFT JOIN dispositions d ON d.id=cv.disposition_id
		   LEFT JOIN stages st ON st.id=cv.stage_id
		  WHERE cv.organization_id=$1%s`, campFilter), args...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	stages, _ := s.queryMaps(ctx,
		fmt.Sprintf(`SELECT s.name, s.system_key, s.sort_order,
		        count(cv.id) AS count
		   FROM stages s
		   LEFT JOIN conversations cv ON cv.stage_id = s.id%s
		  WHERE s.organization_id=$1
		  GROUP BY s.id ORDER BY s.sort_order`, campFilterCv), args...)

	// REAL lead funnel: cumulative "reached this stage or beyond" along the actual
	// sales pipeline (New -> Contacted -> ... -> Delivered). A lead at sort_order K is
	// assumed to have passed every earlier stage, so reached(N) = #leads with so >= N.
	// Monotonically decreasing -> a true funnel with stage-to-stage conversion.
	funnelStages, _ := s.queryMaps(ctx,
		fmt.Sprintf(`WITH cur AS (
		   SELECT COALESCE(s.sort_order, 1) AS so
		     FROM conversations cv LEFT JOIN stages s ON s.id=cv.stage_id
		    WHERE cv.organization_id=$1%s)
		 SELECT st.name, st.system_key, st.sort_order,
		        (SELECT count(*) FROM cur WHERE cur.so >= st.sort_order) AS reached
		   FROM stages st WHERE st.organization_id=$1 ORDER BY st.sort_order`, campFilter), args...)

	categories, _ := s.queryMaps(ctx,
		fmt.Sprintf(`SELECT cat AS category, count(*) AS count
		   FROM conversations cv,
		        jsonb_array_elements_text(COALESCE(cv.metadata->'intent_categories','[]'::jsonb)) AS cat
		  WHERE cv.organization_id=$1%s
		  GROUP BY cat ORDER BY count DESC`, campFilterCv), args...)

	tiers, _ := s.queryMaps(ctx,
		fmt.Sprintf(`WITH c AS (
		   SELECT cv.id, count(m.id) FILTER (WHERE m.direction='inbound' AND m.sender_type='contact') AS replies
		     FROM conversations cv LEFT JOIN messages m ON m.conversation_id=cv.id
		    WHERE cv.organization_id=$1%s GROUP BY cv.id)
		 SELECT count(*) FILTER (WHERE replies=0) AS cold,
		        count(*) FILTER (WHERE replies=1) AS lukewarm,
		        count(*) FILTER (WHERE replies BETWEEN 2 AND 4) AS warm,
		        count(*) FILTER (WHERE replies BETWEEN 5 AND 9) AS engaged,
		        count(*) FILTER (WHERE replies>=10) AS hot
		   FROM c`, campFilterCv), args...)

	// First-response time = first AGENT outbound after the first customer inbound
	// (bot messages excluded so the number reflects the human agent's speed).
	// won = disposition category 'won'. replied = the agent responded.
	agents, _ := s.queryMaps(ctx,
		fmt.Sprintf(`WITH fr AS (
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
		 SELECT u.full_name AS agent,
		        COALESCE(b.name, cmp.name, 'Unassigned') AS branch,
		        count(DISTINCT cv.contact_id) AS leads,
		        count(cv.id) AS total_chat,
		        count(cv.id) FILTER (WHERE cv.last_agent_message_at IS NOT NULL) AS replied,
		        count(cv.id) FILTER (WHERE cv.interest_level='hot') AS hot,
		        count(cv.id) FILTER (WHERE st.sort_order = (SELECT max(sort_order) FROM stages WHERE organization_id=$1)) AS won,
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
		   FROM users u
		   LEFT JOIN conversations cv ON cv.assigned_agent_id=u.id AND cv.organization_id=$1%s
		   LEFT JOIN stages st ON st.id=cv.stage_id
		   LEFT JOIN campaign_branches b ON b.id=cv.branch_id
		   LEFT JOIN campaigns cmp ON cmp.id=cv.campaign_id
		   LEFT JOIN rt ON rt.conversation_id=cv.id
		   LEFT JOIN ar ON ar.conversation_id=cv.id
		  WHERE u.organization_id=$1 AND u.role IN ('agent','admin','manager')
		  GROUP BY u.id, u.full_name, COALESCE(b.name, cmp.name, 'Unassigned')
		  ORDER BY leads DESC`, campFilterCv), args...)

	// Per-day: new leads vs how many got an AGENT reply.
	// All days (one point per active day). The admin view trims to the last 7 in
	// the client; the agent view plots the full history.
	daily, _ := s.queryMaps(ctx,
		fmt.Sprintf(`SELECT to_char(date_trunc('day', created_at),'YYYY-MM-DD') AS day,
		        count(*) AS leads,
		        count(*) FILTER (WHERE last_agent_message_at IS NOT NULL) AS replied
		   FROM conversations WHERE organization_id=$1%s
		  GROUP BY 1 ORDER BY 1`, campFilter), args...)

	rt, _ := s.queryMaps(ctx,
		fmt.Sprintf(`WITH fr AS (
		   SELECT m.conversation_id, min(m.created_at) AS t_c
		     FROM messages m JOIN conversations cv ON cv.id=m.conversation_id
		    WHERE m.organization_id=$1%s AND m.direction='inbound' AND m.sender_type='contact'
		    GROUP BY m.conversation_id),
		 rt AS (
		   SELECT fr.conversation_id,
		          EXTRACT(EPOCH FROM (min(m.created_at) - fr.t_c))/60.0 AS rt_min
		     FROM fr JOIN messages m ON m.conversation_id=fr.conversation_id
		            AND m.direction='outbound' AND m.sender_type='agent' AND m.created_at > fr.t_c
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
		   FROM rt`, campFilterCv), args...)

	var junk int64
	_ = s.pool.QueryRow(ctx,
		fmt.Sprintf(`SELECT count(*) FROM conversations cv JOIN dispositions d ON d.id=cv.disposition_id
		  WHERE cv.organization_id=$1%s AND d.system_key='off_topic'`, campFilterCv), args...).Scan(&junk)

	// Why leads were lost (drives the lost-analysis breakdown + ad attribution).
	lostReasons, _ := s.queryMaps(ctx,
		fmt.Sprintf(`SELECT cv.lost_reason AS reason, count(*) AS count
		   FROM conversations cv
		  WHERE cv.organization_id=$1%s AND cv.lost_reason IS NOT NULL AND cv.lost_reason <> ''
		  GROUP BY 1 ORDER BY 2 DESC LIMIT 8`, campFilter), args...)

	writeJSON(w, map[string]any{
		"funnel":        funnel[0],
		"funnel_stages": funnelStages,
		"stages":        stages,
		"categories":    categories,
		"tiers":         tiers[0],
		"agents":        agents,
		"daily":         daily,
		"response_time": rt[0],
		"junk":          junk,
		"lost":          funnel[0]["lost"],
		"lost_reasons":  lostReasons,
	})
}

// ── GET /api/broadcasts ─────────────────────────────────────
func (s *server) handleListBroadcasts(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	rows, err := s.queryMaps(r.Context(),
		`SELECT b.id::text AS id, b.name, b.status, b.audience, b.body, b.total_recipients, b.sent_count, b.failed_count,
		        b.created_at, b.completed_at, b.scheduled_at, t.name AS template_name
		   FROM broadcasts b
		   LEFT JOIN message_templates t ON t.id = b.template_id
		  WHERE b.organization_id=$1 ORDER BY b.created_at DESC LIMIT 200`,
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
		Name        string   `json:"name"`
		Body        string   `json:"body"`
		TemplateID  string   `json:"template_id"`
		ScheduledAt string   `json:"scheduled_at"` // RFC3339; empty = send now
		Audience    string   `json:"audience"`     // all | selected (label only)
		ChannelID   string   `json:"channel_id"`   // explicit sender channel
		Tags        []string `json:"tags"`         // audience=all: only contacts with any of these tags
		ContactIDs  []string `json:"contact_ids"`  // audience=selected: explicit contacts
		SendNow     *bool    `json:"send_now"`     // nil/true = fire now; false = save as draft
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

	// Status: scheduled (future) > queued (send now) > draft.
	var scheduledAt *time.Time
	sendNow := body.SendNow == nil || *body.SendNow
	status := "draft"
	if body.ScheduledAt != "" {
		if t, err := time.Parse(time.RFC3339, body.ScheduledAt); err == nil && t.After(time.Now()) {
			scheduledAt = &t
			status = "scheduled"
		}
	}
	if status != "scheduled" && sendNow {
		status = "queued"
	}

	// Sender channel: explicit (validated for org) else first active.
	var channelID *string
	if body.ChannelID != "" {
		var cid string
		if e := s.pool.QueryRow(ctx,
			`SELECT id::text FROM channels WHERE organization_id=$1 AND id=$2 LIMIT 1`,
			a.OrgID, body.ChannelID).Scan(&cid); e == nil {
			channelID = &cid
		}
	}
	if channelID == nil {
		_ = s.pool.QueryRow(ctx,
			`SELECT id::text FROM channels WHERE organization_id=$1 AND is_active ORDER BY created_at LIMIT 1`,
			a.OrgID).Scan(&channelID)
	}

	// Audience label on the row; the real recipient set is the snapshot below.
	audience := "all"
	if len(body.ContactIDs) > 0 {
		audience = "selected"
	} else if len(body.Tags) > 0 {
		audience = "tags"
	}

	var bid string
	err := s.pool.QueryRow(ctx,
		`INSERT INTO broadcasts (organization_id, name, body, channel_id, template_id, audience, scheduled_at, status, created_by)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id::text`,
		a.OrgID, body.Name, body.Body, channelID, templateID, audience, scheduledAt, status, a.UserID,
	).Scan(&bid)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Snapshot recipients per audience mode. Only contacts with a phone are eligible.
	snapshot := func(q string, args ...any) (int64, error) {
		ct, e := s.pool.Exec(ctx, q, args...)
		if e != nil {
			return 0, e
		}
		return ct.RowsAffected(), nil
	}
	var total int64
	switch audience {
	case "selected":
		total, err = snapshot(
			`INSERT INTO broadcast_recipients (broadcast_id, organization_id, contact_id, phone)
			 SELECT $1, organization_id, id, phone FROM contacts
			  WHERE organization_id=$2 AND phone IS NOT NULL AND id = ANY($3::uuid[])`,
			bid, a.OrgID, body.ContactIDs)
	case "tags":
		total, err = snapshot(
			`INSERT INTO broadcast_recipients (broadcast_id, organization_id, contact_id, phone)
			 SELECT $1, organization_id, id, phone FROM contacts
			  WHERE organization_id=$2 AND phone IS NOT NULL AND tags && $3::text[]`,
			bid, a.OrgID, body.Tags)
	default:
		total, err = snapshot(
			`INSERT INTO broadcast_recipients (broadcast_id, organization_id, contact_id, phone)
			 SELECT $1, organization_id, id, phone FROM contacts
			  WHERE organization_id=$2 AND phone IS NOT NULL`,
			bid, a.OrgID)
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
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

// ── POST /api/broadcasts/{id}/send ── send a draft/scheduled broadcast now.
func (s *server) handleSendBroadcast(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	id := r.PathValue("id")
	ctx := r.Context()
	ct, err := s.pool.Exec(ctx,
		`UPDATE broadcasts SET status='queued', scheduled_at=NULL
		   WHERE id=$1 AND organization_id=$2 AND status IN ('draft','scheduled','failed')`,
		id, a.OrgID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if ct.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if err := s.bus.Publish(events.SubjectBroadcastRequested, a.OrgID, events.BroadcastRequested{BroadcastID: id}); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.audit(ctx, a, "sent", "broadcast", id, nil)
	writeJSON(w, map[string]any{"status": "queued"})
}

// ── DELETE /api/broadcasts/{id} ──
func (s *server) handleDeleteBroadcast(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	id := r.PathValue("id")
	ct, err := s.pool.Exec(r.Context(),
		`DELETE FROM broadcasts WHERE id=$1 AND organization_id=$2`, id, a.OrgID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if ct.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	s.audit(r.Context(), a, "deleted", "broadcast", id, nil)
	w.WriteHeader(http.StatusNoContent)
}

// ── POST /api/broadcasts/test-send {channel_id?, contact_id, body?, template_id?} ──
// Sends a one-off message to a single contact so the user can preview delivery
// before launching the full broadcast. Reuses the normal outbound path.
func (s *server) handleTestSendBroadcast(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var body struct {
		ChannelID  string `json:"channel_id"`
		ContactID  string `json:"contact_id"`
		Body       string `json:"body"`
		TemplateID string `json:"template_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.ContactID == "" {
		http.Error(w, "contact_id required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	if body.TemplateID != "" {
		if rendered, ok := s.renderTemplate(ctx, a.OrgID, body.TemplateID); ok {
			body.Body = rendered
		}
	}
	if body.Body == "" {
		http.Error(w, "body or template required", http.StatusBadRequest)
		return
	}
	// Contact must belong to the org and have a phone (IDOR guard).
	var phone *string
	if err := s.pool.QueryRow(ctx,
		`SELECT phone FROM contacts WHERE id=$1 AND organization_id=$2`,
		body.ContactID, a.OrgID).Scan(&phone); err != nil {
		http.Error(w, "contact not found", http.StatusNotFound)
		return
	}
	if phone == nil || *phone == "" {
		http.Error(w, "contact has no phone", http.StatusBadRequest)
		return
	}
	// Sender channel: explicit (org-validated) else first active.
	var channelID string
	if body.ChannelID != "" {
		_ = s.pool.QueryRow(ctx,
			`SELECT id::text FROM channels WHERE organization_id=$1 AND id=$2 LIMIT 1`,
			a.OrgID, body.ChannelID).Scan(&channelID)
	}
	if channelID == "" {
		_ = s.pool.QueryRow(ctx,
			`SELECT id::text FROM channels WHERE organization_id=$1 AND is_active ORDER BY created_at LIMIT 1`,
			a.OrgID).Scan(&channelID)
	}
	if err := s.bus.Publish(events.SubjectMessageOutbound, a.OrgID, events.MessageOutbound{
		ContactID:  body.ContactID,
		ChannelID:  channelID,
		SenderType: "system",
		Type:       "text",
		Body:       body.Body,
	}); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"status": "sent"})
}

// ── GET /api/broadcasts/{id} ── full detail + derived report stats. ──
func (s *server) handleGetBroadcast(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	id := r.PathValue("id")
	ctx := r.Context()
	row, err := s.queryMaps(ctx,
		`SELECT b.id::text AS id, b.name, b.status, b.audience, b.body,
		        b.total_recipients, b.sent_count, b.failed_count,
		        b.created_at, b.started_at, b.completed_at, b.scheduled_at,
		        t.name AS template_name, t.language AS template_language,
		        ch.name AS channel_name, ch.display_id AS channel_display,
		        u.full_name AS created_by_name,
		        (SELECT count(*) FROM broadcast_recipients br WHERE br.broadcast_id=b.id AND br.status='pending') AS pending_count,
		        (SELECT count(*) FROM broadcast_recipients br
		          WHERE br.broadcast_id=b.id AND EXISTS (
		            SELECT 1 FROM messages im JOIN conversations cv ON cv.id=im.conversation_id
		             WHERE cv.contact_id=br.contact_id AND im.sender_type='contact'
		               AND im.organization_id=b.organization_id
		               AND im.created_at >= COALESCE(br.sent_at, b.started_at, b.created_at))) AS responses,
		        (SELECT count(*) FROM broadcast_recipients br
		           JOIN messages m ON m.id=br.message_id
		          WHERE br.broadcast_id=b.id AND m.status='read') AS read_count,
		        (SELECT count(*) FROM broadcast_recipients br
		           JOIN messages m ON m.id=br.message_id
		          WHERE br.broadcast_id=b.id AND m.status IN ('delivered','read')) AS delivered_count,
		        (SELECT count(*) FROM broadcast_recipients br
		          WHERE br.broadcast_id=b.id AND br.clicked_at IS NOT NULL) AS clicks
		   FROM broadcasts b
		   LEFT JOIN message_templates t ON t.id=b.template_id
		   LEFT JOIN channels ch ON ch.id=b.channel_id
		   LEFT JOIN users u ON u.id=b.created_by
		  WHERE b.id=$1 AND b.organization_id=$2`, id, a.OrgID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if len(row) == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	writeJSON(w, row[0])
}

// ── GET /api/broadcasts/{id}/recipients ── per-recipient delivery rows. ──
func (s *server) handleListBroadcastRecipients(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	id := r.PathValue("id")
	ctx := r.Context()
	// Tenant guard.
	var ok bool
	_ = s.pool.QueryRow(ctx, `SELECT true FROM broadcasts WHERE id=$1 AND organization_id=$2`, id, a.OrgID).Scan(&ok)
	if !ok {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	rows, err := s.queryMaps(ctx,
		`SELECT br.id::text AS id, br.contact_id::text AS contact_id,
		        c.full_name AS contact_name, br.phone, br.status AS send_status,
		        br.error, br.sent_at,
		        (br.clicked_at IS NOT NULL) AS clicked, br.clicked_button,
		        COALESCE(m.status, 'pending') AS read_status,
		        COALESCE(m.type, 'text') AS type,
		        EXISTS (
		          SELECT 1 FROM messages im JOIN conversations cv ON cv.id=im.conversation_id
		           WHERE cv.contact_id=br.contact_id AND im.sender_type='contact'
		             AND im.organization_id=br.organization_id
		             AND im.created_at >= COALESCE(br.sent_at, '1970-01-01'::timestamptz)) AS responded
		   FROM broadcast_recipients br
		   JOIN contacts c ON c.id=br.contact_id
		   LEFT JOIN messages m ON m.id=br.message_id
		  WHERE br.broadcast_id=$1 AND br.organization_id=$2
		  ORDER BY c.full_name NULLS LAST, br.phone`, id, a.OrgID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

// ── POST /api/broadcasts/{id}/retry ── reset failed recipients and re-queue. ──
func (s *server) handleRetryBroadcast(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	id := r.PathValue("id")
	ctx := r.Context()
	// Tenant guard + must own the broadcast.
	var status string
	if err := s.pool.QueryRow(ctx, `SELECT status FROM broadcasts WHERE id=$1 AND organization_id=$2`, id, a.OrgID).Scan(&status); err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	ct, err := s.pool.Exec(ctx,
		`UPDATE broadcast_recipients SET status='pending', error=NULL, sent_at=NULL
		   WHERE broadcast_id=$1 AND organization_id=$2 AND status='failed'`, id, a.OrgID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if ct.RowsAffected() == 0 {
		writeJSON(w, map[string]any{"status": status, "retried": 0})
		return
	}
	_, _ = s.pool.Exec(ctx, `UPDATE broadcasts SET status='queued', completed_at=NULL WHERE id=$1 AND organization_id=$2`, id, a.OrgID)
	if err := s.bus.Publish(events.SubjectBroadcastRequested, a.OrgID, events.BroadcastRequested{BroadcastID: id}); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.audit(ctx, a, "retried", "broadcast", id, map[string]any{"retried": ct.RowsAffected()})
	writeJSON(w, map[string]any{"status": "queued", "retried": ct.RowsAffected()})
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
		   FROM quick_replies WHERE organization_id=$1 AND created_by=$2 ORDER BY shortcut`, a.OrgID, a.UserID)
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
		 ON CONFLICT (organization_id, created_by, shortcut) DO UPDATE SET title=EXCLUDED.title, body=EXCLUDED.body
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
		`DELETE FROM quick_replies WHERE id=$1 AND organization_id=$2 AND created_by=$3`, r.PathValue("id"), a.OrgID, a.UserID)
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
	
	filter := "WHERE ct.organization_id=$1"
	args := []any{a.OrgID}

	if a.Role == "agent" {
		args = append(args, a.UserID)
		filter += fmt.Sprintf(" AND lc.assigned_agent_id = $%d", len(args))
	} else if a.Role == "manager" {
		args = append(args, a.UserID)
		filter += " AND " + managerScope("lc", len(args))
	}

	query := fmt.Sprintf(`SELECT ct.id::text AS id, ct.full_name, ct.phone, ct.source_channel, ct.created_at,
		        ct.updated_at, ct.blacklisted, ct.web_api_source_id::text AS web_api_source_id,
		        COALESCE(ct.tags, '{}') AS tags,
		        lc.interest_level, lc.stage_id::text AS stage_id, ls.name AS stage_name, lc.last_message_at, lc.ai_summary,
		        lc.assigned_agent_id::text AS assigned_agent_id, lu.full_name AS agent_name,
		        lc.campaign_id::text AS campaign_id, lcmp.name AS campaign_name,
		        lc.conversation_id::text AS conversation_id, lch.name AS channel_name,
		        was.name AS web_api_source_name, att.referral_source AS source_id, att.referral_url AS source_url
		   FROM contacts ct
		   LEFT JOIN LATERAL (
		     SELECT id AS conversation_id, interest_level, stage_id, last_message_at, ai_reason AS ai_summary,
		            assigned_agent_id, campaign_id, channel_id
		       FROM conversations WHERE contact_id=ct.id
		      ORDER BY last_message_at DESC NULLS LAST LIMIT 1
		   ) lc ON true
		   LEFT JOIN stages ls ON ls.id = lc.stage_id
		   LEFT JOIN users lu ON lu.id = lc.assigned_agent_id
		   LEFT JOIN campaigns lcmp ON lcmp.id = lc.campaign_id
		   LEFT JOIN channels lch ON lch.id = lc.channel_id
		   LEFT JOIN web_api_sources was ON was.id = ct.web_api_source_id
		   LEFT JOIN LATERAL (
		     SELECT referral_source, referral_url FROM conversation_attributions
		      WHERE conversation_id = lc.conversation_id AND referral_source IS NOT NULL
		      ORDER BY created_at DESC LIMIT 1
		   ) att ON true
		  %s
		  ORDER BY ct.created_at DESC LIMIT 500`, filter)

	rows, err := s.queryMaps(r.Context(), query, args...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

// ── POST /api/contacts — manually create a contact ──────────
func (s *server) handleCreateContact(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var body struct {
		FullName string   `json:"full_name"`
		Phone    string   `json:"phone"`
		Tags     []string `json:"tags"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	body.FullName = strings.TrimSpace(body.FullName)
	body.Phone = strings.TrimSpace(body.Phone)
	if body.FullName == "" && body.Phone == "" {
		http.Error(w, "name or phone is required", http.StatusBadRequest)
		return
	}
	tags := body.Tags
	if tags == nil {
		tags = []string{}
	}
	rows, err := s.queryMaps(r.Context(),
		`INSERT INTO contacts (organization_id, full_name, phone, source_channel, tags)
		   VALUES ($1, NULLIF($2,''), NULLIF($3,''), 'manual', $4)
		 RETURNING id::text AS id, full_name, phone, source_channel, created_at, COALESCE(tags,'{}') AS tags`,
		a.OrgID, body.FullName, body.Phone, tags)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows[0])
}

// ── PATCH /api/contacts/{id} — edit name/phone (tenant-scoped) ──
func (s *server) handleUpdateContact(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	id := r.PathValue("id")
	var body struct {
		FullName    *string   `json:"full_name"`
		Phone       *string   `json:"phone"`
		Tags        *[]string `json:"tags"`
		Blacklisted *bool     `json:"blacklisted"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	tag, err := s.pool.Exec(r.Context(),
		`UPDATE contacts SET
		     full_name   = COALESCE($3, full_name),
		     phone       = COALESCE($4, phone),
		     tags        = COALESCE($5, tags),
		     blacklisted = COALESCE($6, blacklisted),
		     updated_at  = now()
		   WHERE id=$1 AND organization_id=$2`,
		id, a.OrgID, body.FullName, body.Phone, body.Tags, body.Blacklisted)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound) // IDOR guard
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ── DELETE /api/contacts/{id} — remove a contact + its conversations ──
func (s *server) handleDeleteContact(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	id := r.PathValue("id")
	// Verify the contact belongs to the org (IDOR guard) before deleting.
	var exists string
	if err := s.pool.QueryRow(r.Context(),
		`SELECT id::text FROM contacts WHERE id=$1 AND organization_id=$2`, id, a.OrgID).Scan(&exists); err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	// Remove the contact's conversations first (messages cascade), then the contact.
	_, _ = s.pool.Exec(r.Context(), `DELETE FROM conversations WHERE contact_id=$1 AND organization_id=$2`, id, a.OrgID)
	if _, err := s.pool.Exec(r.Context(), `DELETE FROM contacts WHERE id=$1 AND organization_id=$2`, id, a.OrgID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.audit(r.Context(), a, "deleted", "contact", id, nil)
	w.WriteHeader(http.StatusNoContent)
}

// ── Proxy assign/close ke conversation service ──────────────
func (s *server) handleAssign(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	convID := r.PathValue("id")
	if !s.guardConversation(w, r, convID) {
		return
	}
	// Manual (re)assign / unassign is a supervisory action: owner/admin/manager only.
	if a.Role != "owner" && a.Role != "admin" && a.Role != "manager" {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	// Inject the actor so the conversation service can attribute the audit event.
	var body map[string]any
	bodyBytes, _ := io.ReadAll(r.Body)
	if len(bodyBytes) > 0 {
		_ = json.Unmarshal(bodyBytes, &body)
	}
	if body == nil {
		body = map[string]any{}
	}
	body["actor_id"] = a.UserID
	bodyBytes, _ = json.Marshal(body)
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
