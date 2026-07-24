package main

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
)

// ── Async data exports ───────────────────────────────────────────────────────
// A section's "Export" queues a job; a gateway goroutine generates the FULL CSV
// (every row, not a capped page), uploads it to storage, and flips the job to
// completed. The Downloads tab polls GET /api/exports for live status.

var exportKinds = map[string]bool{"messages": true, "conversations": true, "calls": true, "activity": true}

// POST /api/exports {kind, from?, to?}
func (s *server) handleCreateExport(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var b struct {
		Kind       string `json:"kind"`
		From       string `json:"from"`
		To         string `json:"to"`
		CampaignID string `json:"campaign_id"`
		ChannelID  string `json:"channel_id"`
		Label      string `json:"label"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil || !exportKinds[b.Kind] {
		http.Error(w, "valid kind required", http.StatusBadRequest)
		return
	}
	if s.storage == nil {
		http.Error(w, "storage not configured", http.StatusServiceUnavailable)
		return
	}
	jobID := uuid.NewString()
	if _, err := s.pool.Exec(r.Context(),
		`INSERT INTO export_jobs (id, organization_id, requested_by, kind, date_from, date_to, campaign_id, channel_id, label, status)
		 VALUES ($1,$2,$3::uuid,$4, NULLIF($5,'')::date, NULLIF($6,'')::date, NULLIF($7,''), NULLIF($8,''), NULLIF($9,''), 'queued')`,
		jobID, a.OrgID, a.UserID, b.Kind, b.From, b.To, b.CampaignID, b.ChannelID, b.Label); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	// Resolve visibility on the request goroutine (it reads the org matrix), then
	// hand the tier + caller id to the background job so the generated CSV is scoped
	// to exactly what the requester may see -- an agent's export must not contain the
	// whole campaign's messages, and a manager's must not contain other campaigns.
	vis := s.conversationVisibility(r.Context(), a)
	go s.runExport(jobID, a.OrgID, b.Kind, b.From, b.To, b.CampaignID, b.ChannelID, b.Label, a.UserID, vis)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"id": jobID, "status": "queued"})
}

// GET /api/exports
func (s *server) handleListExports(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	// A download is a snapshot of scoped data, so who may see it in the list mirrors
	// the same three tiers: owner/admin see all exports; a manager sees their team's;
	// an agent sees only their own. campaign_id/channel_id are comma-separated id
	// lists (multi-select), so resolve every id to a name for the "Filters" chips.
	args := []any{a.OrgID}
	sc, args := s.userLogScope(r.Context(), a, "e.requested_by", args)
	rows, err := s.queryMaps(r.Context(),
		`SELECT e.id::text, e.kind, e.date_from, e.date_to, e.status, e.row_count, e.file_url,
		        e.error, e.expires_at, e.created_at, e.completed_at, u.full_name AS requested_by,
		        e.campaign_id, e.channel_id, e.label,
		        (SELECT string_agg(cmp.name, ', ') FROM campaigns cmp
		          WHERE cmp.id::text = ANY(string_to_array(e.campaign_id, ','))) AS campaign_name,
		        (SELECT string_agg(ch.name, ', ') FROM channels ch
		          WHERE ch.id::text = ANY(string_to_array(e.channel_id, ','))) AS channel_name
		   FROM export_jobs e
		   LEFT JOIN users u ON u.id = e.requested_by
		  WHERE e.organization_id = $1`+sc+` ORDER BY e.created_at DESC LIMIT 100`, args...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

// runExport generates the full CSV for the job and flips its status (background).
func (s *server) runExport(jobID, orgID, kind, from, to, campaignID, channelID, label, viewerID string, vis convVisibility) {
	ctx := context.Background()
	_, _ = s.pool.Exec(ctx, `UPDATE export_jobs SET status='processing' WHERE id=$1`, jobID)

	q, headers, keys := exportQuery(kind)
	if q == "" {
		s.failExport(ctx, jobID, "unknown export kind")
		return
	}
	p := logParams{from: from, to: to, campaignID: campaignID, channelID: channelID, label: label}
	args := []any{orgID}
	df, args := dateFilter(exportDateCol(kind), p, args)
	filter := df
	if kind != "activity" { // activity has no conversation join
		cf, a2 := convFilter("cv", p, args)
		args = a2
		filter += cf
	}
	if kind == "messages" && label != "" {
		args = append(args, label)
		filter += fmt.Sprintf(" AND $%d = ANY(ct.tags)", len(args))
	}
	// Visibility scope, identical to the on-screen log handlers: activity is keyed on
	// the user, everything else on the conversation the row hangs off.
	var sc string
	if kind == "activity" {
		sc, args = scopeUserSQL(vis, "ev.user_id", viewerID, args)
	} else {
		sc, args = scopeConvSQL(vis, "cv", viewerID, args)
	}
	filter += sc
	q = fmt.Sprintf(q, filter)

	rows, err := s.queryMaps(ctx, q, args...)
	if err != nil {
		s.failExport(ctx, jobID, err.Error())
		return
	}

	loc := s.orgLocation(ctx, orgID) // render timestamps in the workspace timezone

	var buf bytes.Buffer
	// UTF-8 BOM so Excel opens the file with the right encoding.
	buf.WriteString("\xEF\xBB\xBF")
	cw := csv.NewWriter(&buf)
	_ = cw.Write(headers)
	for _, row := range rows {
		rec := make([]string, len(keys))
		for i, k := range keys {
			rec[i] = csvVal(row[k], loc)
		}
		_ = cw.Write(rec)
	}
	cw.Flush()

	key := fmt.Sprintf("exports/%s-%s.csv", kind, jobID)
	url, err := s.storage.put(ctx, key, "text/csv; charset=utf-8", bytes.NewReader(buf.Bytes()), int64(buf.Len()))
	if err != nil {
		s.failExport(ctx, jobID, "upload failed: "+err.Error())
		return
	}
	if _, err := s.pool.Exec(ctx,
		`UPDATE export_jobs SET status='completed', row_count=$2, file_url=$3,
		        expires_at=now()+interval '30 days', completed_at=now() WHERE id=$1`,
		jobID, len(rows), url); err != nil {
		s.log.Error("finalize export failed", "job", jobID, "err", err)
	}
}

func (s *server) failExport(ctx context.Context, jobID, msg string) {
	s.log.Error("export failed", "job", jobID, "err", msg)
	_, _ = s.pool.Exec(ctx, `UPDATE export_jobs SET status='failed', error=$2, completed_at=now() WHERE id=$1`, jobID, msg)
}

func csvVal(v any, loc *time.Location) string {
	switch x := v.(type) {
	case nil:
		return ""
	case time.Time:
		if x.IsZero() {
			return ""
		}
		// MM/DD/YYYY HH:MM:SS in the workspace tz, matching the training CSVs.
		return x.In(loc).Format("01/02/2006 15:04:05")
	case string:
		return x
	default:
		return fmt.Sprintf("%v", x)
	}
}

// orgLocation resolves the workspace timezone (organizations.settings.timezone,
// e.g. "Asia/Jakarta") so exported timestamps read in local time, not UTC.
func (s *server) orgLocation(ctx context.Context, orgID string) *time.Location {
	var tz string
	_ = s.pool.QueryRow(ctx, `SELECT COALESCE(settings->>'timezone','') FROM organizations WHERE id=$1`, orgID).Scan(&tz)
	if tz == "" {
		tz = "Asia/Jakarta"
	}
	if loc, err := time.LoadLocation(tz); err == nil {
		return loc
	}
	return time.UTC
}

func exportDateCol(kind string) string {
	switch kind {
	case "messages":
		return "m.created_at" // message-level dump
	case "conversations":
		return "cv.created_at" // one row per conversation
	case "calls":
		return "c.created_at"
	case "activity":
		return "ev.at"
	}
	return "created_at"
}

// exportQuery returns SQL with a single %s placeholder for the date filter, plus
// the CSV header row and the matching map keys (headers can be pretty labels that
// differ from the SQL aliases). Mirrors the SmartKonek training exports
// (data-train/*.csv) so drops flow straight into the training pipeline.
func exportQuery(kind string) (string, []string, []string) {
	switch kind {
	case "conversations":
		// One row per unique conversation (summary + SLA), mirroring the System
		// Logs conversation table. assigned_at = first 'assigned' event;
		// avg_response_sec = mean gap from each customer message to the agent's
		// next reply.
		keys := []string{
			"agent_name", "agent_email", "campaign_name", "customer_name", "contact_number", "contact_email",
			"stage", "lost_reason", "interest_level", "chat_initiation", "assigned_at",
			"first_response_sec", "avg_response_sec", "closing_at", "status", "conversation_id",
		}
		headers := []string{
			"Agent Name", "Agent Email", "Campaign", "Customer Name", "Contact Number", "Customer Email",
			"Stage", "Lost Reason", "Interest Level", "Chat Initiation Time", "Assigned At",
			"First Response Time (sec)", "Avg Response Time (sec)", "Closing Time", "Status", "Conversation ID",
		}
		q := `SELECT u.full_name AS agent_name, u.email AS agent_email,
		        COALESCE(br.name, cmp.name) AS campaign_name,
		        ct.full_name AS customer_name, ct.phone AS contact_number, ct.email AS contact_email,
		        st.name AS stage, cv.lost_reason AS lost_reason, cv.interest_level AS interest_level,
		        cv.created_at AS chat_initiation, asg.assigned_at AS assigned_at,
		        COALESCE(EXTRACT(EPOCH FROM (cv.first_responsed_at - cv.created_at))::int, 0) AS first_response_sec,
		        COALESCE(rt.avg_sec, 0) AS avg_response_sec,
		        cv.closed_at AS closing_at, cv.status, cv.id::text AS conversation_id
		      FROM conversations cv
		          LEFT JOIN users u ON u.id = cv.assigned_agent_id
		          LEFT JOIN campaigns cmp ON cmp.id = cv.campaign_id
		          LEFT JOIN campaign_branches br ON br.id = cv.branch_id
		          LEFT JOIN contacts ct ON ct.id = cv.contact_id
		          LEFT JOIN stages st ON st.id = cv.stage_id
		          LEFT JOIN LATERAL (
		            SELECT min(created_at) AS assigned_at FROM conversation_events
		             WHERE conversation_id = cv.id AND type = 'assigned'
		          ) asg ON true
		          LEFT JOIN LATERAL (
		            SELECT AVG(EXTRACT(EPOCH FROM (created_at - prev_in)))::int AS avg_sec FROM (
		              SELECT created_at, direction,
		                     MAX(created_at) FILTER (WHERE direction='inbound')
		                       OVER (ORDER BY created_at ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS prev_in,
		                     LAG(direction) OVER (ORDER BY created_at) AS prev_dir
		                FROM messages WHERE conversation_id = cv.id
		            ) w WHERE direction='outbound' AND prev_dir='inbound'
		          ) rt ON true
		         WHERE cv.organization_id = $1%s ORDER BY cv.created_at DESC`
		return q, headers, keys
	case "messages":
		// Message-level dump in the SmartKonek training CSV shape. Every column the
		// reference exports carries is emitted; a field with no source in our schema
		// is emitted empty rather than dropped.
		aiHeader := "AI Wallet Deducted"
		headers := []string{
			"File Name", "Channel Id", "Contact ID", "Contact Name", "Sender/Agent Name",
			"Agent Name", "Agent Email", "Campaign", "Direction", "Call Duration (in sec)", "Error Message", "Billable",
			"Cost Currency", "Message Cost", aiHeader, "Created At", "Updated At",
			"Call ID", "Recording Url", "Connect Status", "Call Status", "Message Type",
			"Message ID", "Message", "File Url", "File Caption", "Read Status",
			"Sent Status", "Contact Phone Number", "Contact Email", "Source Url", "Source Id", "Source Type",
		}
		keys := []string{
			"file_name", "channel_id", "contact_id", "contact_name", "sender_name",
			"agent_name", "agent_email", "campaign_name", "direction", "call_duration", "error_message", "billable",
			"cost_currency", "message_cost", "ai_credits", "created_at", "updated_at",
			"call_id", "recording_url", "connect_status", "call_status", "message_type",
			"message_id", "message", "file_url", "file_caption", "read_status",
			"sent_status", "contact_phone", "contact_email", "source_url", "source_id", "source_type",
		}
		q := `SELECT
		        COALESCE(m.metadata->>'file_name','')      AS file_name,
		        cv.channel_id::text                        AS channel_id,
		        cv.contact_id::text                        AS contact_id,
		        ct.full_name                               AS contact_name,
		        CASE WHEN m.direction='inbound' THEN ct.full_name
		             ELSE COALESCE(u.full_name, CASE WHEN m.sender_type='bot' THEN 'Bot' END) END AS sender_name,
		        u.full_name                                AS agent_name,
		        u.email                                    AS agent_email,
		        COALESCE(brx.name, cmpx.name)              AS campaign_name,
		        CASE WHEN m.direction='inbound' THEN 'Incoming' ELSE 'Outgoing' END AS direction,
		        ''                                         AS call_duration,
		        COALESCE(m.metadata->>'error','')          AS error_message,
		        'False'                                    AS billable,
		        ''                                         AS cost_currency,
		        ''                                         AS message_cost,
		        COALESCE(m.metadata->>'ai_credits','')     AS ai_credits,
		        m.created_at,
		        m.created_at                               AS updated_at,
		        ''                                         AS call_id,
		        ''                                         AS recording_url,
		        ''                                         AS connect_status,
		        ''                                         AS call_status,
		        m.type                                     AS message_type,
		        COALESCE(m.external_id, m.id::text)        AS message_id,
		        COALESCE(m.body,'')                        AS message,
		        COALESCE(m.media_url,'')                   AS file_url,
		        COALESCE(m.metadata->>'caption','')        AS file_caption,
		        CASE WHEN m.status='read' THEN 'viewed' ELSE '' END AS read_status,
		        CASE WHEN m.status IN ('sent','delivered','read') THEN 'sent'
		             WHEN m.status='queued' THEN 'pending'
		             WHEN m.status='failed' THEN 'failed'
		             ELSE m.status END                     AS sent_status,
		        ct.phone                                   AS contact_phone,
		        COALESCE(ct.email,'')                      AS contact_email,
		        COALESCE(att.referral_url,'')              AS source_url,
		        COALESCE(att.referral_source,'')           AS source_id,
		        -- Specific platform, not a generic 'ad'/'web': a CTWA referral is
		        -- always Meta by definition (WhatsApp click-to-chat is a Meta-only
		        -- feature); a Web API lead uses the source's tagged platform.
		        CASE WHEN att.referral_source IS NOT NULL THEN 'meta_ads'
		             WHEN was.platform = 'meta' THEN 'meta_ads'
		             WHEN was.platform = 'tiktok' THEN 'tiktok_ads'
		             WHEN was.platform = 'google' THEN 'google_ads'
		             WHEN ct.web_api_source_id IS NOT NULL THEN 'website'
		             ELSE '' END                           AS source_type
		      FROM messages m
		          JOIN conversations cv ON cv.id = m.conversation_id
		          LEFT JOIN contacts ct ON ct.id = cv.contact_id
		          LEFT JOIN users u ON u.id = m.sender_id
		          LEFT JOIN campaigns cmpx ON cmpx.id = cv.campaign_id
		          LEFT JOIN campaign_branches brx ON brx.id = cv.branch_id
		          LEFT JOIN web_api_sources was ON was.id = ct.web_api_source_id
		          LEFT JOIN LATERAL (
		            SELECT referral_source, referral_url FROM conversation_attributions
		             WHERE conversation_id = cv.id ORDER BY created_at DESC LIMIT 1
		          ) att ON true
		         WHERE m.organization_id = $1%s ORDER BY m.created_at DESC`
		return q, headers, keys
	case "calls":
		keys := []string{"direction", "name", "phone", "duration_seconds", "received_at", "ended_at", "call_status", "end_reason", "agent", "id"}
		return `SELECT c.direction, ct.full_name AS name, c.contact_phone AS phone,
		             c.duration_seconds, c.created_at AS received_at, c.call_ended_at AS ended_at,
		             c.call_status, c.end_reason, u.full_name AS agent, c.id::text AS id
		      FROM calls c
		          LEFT JOIN conversations cv ON cv.id = c.conversation_id
		          LEFT JOIN contacts ct ON ct.id = cv.contact_id
		          LEFT JOIN users u ON u.id = c.agent_id
		         WHERE c.organization_id = $1%s ORDER BY c.created_at DESC`,
			[]string{"Direction", "Name", "Phone Number", "Call Duration (in sec)", "Received At", "Ended At", "Call Status", "End Reason", "Agent", "Call ID"}, keys
	case "activity":
		keys := []string{"agent_name", "agent_email", "kind", "event", "detail", "action_at"}
		return `SELECT u.full_name AS agent_name, u.email AS agent_email,
		             ev.kind, ev.event, ev.detail, ev.at AS action_at
		      FROM user_activity_events ev
		          JOIN users u ON u.id = ev.user_id
		         WHERE ev.organization_id = $1%s ORDER BY ev.at DESC`,
			[]string{"Agent Name", "Agent Email", "Kind", "Event", "Detail", "Action At"}, keys
	}
	return "", nil, nil
}
