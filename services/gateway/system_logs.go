package main

import (
	"fmt"
	"net/http"
	"strconv"
)

// ── System Logs ──────────────────────────────────────────────
// Paginated, exportable views over messages, conversations and calls. Column
// shapes mirror the SmartKonek training exports (data-train/*.csv) so upcoming
// data drops straight into the training pipeline.

type logParams struct {
	limit, offset                int
	from, to                     string
	campaignID, channelID, label string
}

func parseLogParams(r *http.Request) logParams {
	p := logParams{limit: 50, offset: 0}
	if v, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && v > 0 && v <= 1000 {
		p.limit = v
	}
	if v, err := strconv.Atoi(r.URL.Query().Get("offset")); err == nil && v >= 0 {
		p.offset = v
	}
	p.from = r.URL.Query().Get("from")
	p.to = r.URL.Query().Get("to")
	p.campaignID = r.URL.Query().Get("campaign_id")
	p.channelID = r.URL.Query().Get("channel_id")
	p.label = r.URL.Query().Get("label")
	return p
}

// convFilter appends campaign/channel filters on the given conversations alias.
func convFilter(alias string, p logParams, args []any) (string, []any) {
	clause := ""
	if p.campaignID != "" {
		args = append(args, p.campaignID)
		clause += fmt.Sprintf(" AND %s.campaign_id = $%d::uuid", alias, len(args))
	}
	if p.channelID != "" {
		args = append(args, p.channelID)
		clause += fmt.Sprintf(" AND %s.channel_id = $%d::uuid", alias, len(args))
	}
	return clause, args
}

// dateFilter appends a created_at range on the given column, growing args.
func dateFilter(col string, p logParams, args []any) (string, []any) {
	clause := ""
	if p.from != "" {
		args = append(args, p.from)
		clause += fmt.Sprintf(" AND %s >= $%d::date", col, len(args))
	}
	if p.to != "" {
		args = append(args, p.to)
		clause += fmt.Sprintf(" AND %s < ($%d::date + 1)", col, len(args))
	}
	return clause, args
}

func (s *server) countAndRespond(w http.ResponseWriter, r *http.Request, countSQL string, rows []map[string]any, args []any) {
	var total int64
	if err := s.pool.QueryRow(r.Context(), countSQL, args...).Scan(&total); err != nil {
		total = int64(len(rows))
	}
	writeJSON(w, map[string]any{"rows": rows, "total": total})
}

// GET /api/system-logs/messages
func (s *server) handleLogMessages(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	p := parseLogParams(r)
	args := []any{a.OrgID}
	df, args := dateFilter("m.created_at", p, args)
	cf, args := convFilter("cv", p, args)
	lf := ""
	if p.label != "" {
		args = append(args, p.label)
		lf = fmt.Sprintf(" AND $%d = ANY(ct.tags)", len(args))
	}

	base := `FROM messages m
	          JOIN conversations cv ON cv.id = m.conversation_id
	          LEFT JOIN contacts ct ON ct.id = cv.contact_id
	          LEFT JOIN users u ON u.id = m.sender_id
	          LEFT JOIN channels ch ON ch.id = cv.channel_id
	          LEFT JOIN LATERAL (
	            SELECT referral_source, referral_url FROM conversation_attributions
	             WHERE conversation_id = cv.id ORDER BY created_at DESC LIMIT 1
	          ) att ON true
	         WHERE m.organization_id = $1` + df + cf + lf

	q := `SELECT m.created_at, m.direction, m.type AS message_type, m.body AS message,
	             m.media_url AS file_url, m.status, COALESCE(m.external_id, m.id::text) AS message_id,
	             cv.id::text AS conversation_id, cv.channel_id::text AS channel_id, ch.name AS channel_name,
	             cv.contact_id::text AS contact_id, ct.full_name AS contact_name, ct.phone AS contact_phone,
	             u.full_name AS agent_name, u.email AS agent_email,
	             att.referral_source AS source_id, att.referral_url AS source_url
	      ` + base + fmt.Sprintf(" ORDER BY m.created_at DESC LIMIT %d OFFSET %d", p.limit, p.offset)

	rows, err := s.queryMaps(r.Context(), q, args...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.countAndRespond(w, r, "SELECT count(*) "+base, rows, args)
}

// GET /api/system-logs/conversations
func (s *server) handleLogConversations(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	p := parseLogParams(r)
	args := []any{a.OrgID}
	df, args := dateFilter("cv.created_at", p, args)
	cf, args := convFilter("cv", p, args)

	base := `FROM conversations cv
	          LEFT JOIN users u ON u.id = cv.assigned_agent_id
	          LEFT JOIN departments d ON d.id = cv.department_id
	          LEFT JOIN contacts ct ON ct.id = cv.contact_id
	          LEFT JOIN dispositions disp ON disp.id = cv.disposition_id
	         WHERE cv.organization_id = $1` + df + cf

	q := `SELECT u.full_name AS agent_name, u.email AS email, d.name AS department_name,
	             ct.full_name AS customer_name, disp.name AS disposition, ct.phone AS contact_number,
	             cv.created_at AS assigned_at, cv.closed_at,
	             COALESCE(EXTRACT(EPOCH FROM (cv.first_responsed_at - cv.created_at))::int, 0) AS first_response_sec,
	             COALESCE(EXTRACT(EPOCH FROM (cv.closed_at - cv.created_at))::int, 0) AS closing_sec,
	             (SELECT count(*) FROM messages mm WHERE mm.conversation_id = cv.id AND mm.direction='outbound' AND mm.sender_type='agent')::int AS agent_messages,
	             cv.status, cv.created_at AS chat_initiation, cv.id::text AS id
	      ` + base + fmt.Sprintf(" ORDER BY cv.created_at DESC LIMIT %d OFFSET %d", p.limit, p.offset)

	rows, err := s.queryMaps(r.Context(), q, args...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.countAndRespond(w, r, "SELECT count(*) "+base, rows, args)
}

// GET /api/system-logs/activity — agent presence / lifecycle events.
func (s *server) handleLogActivity(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	p := parseLogParams(r)
	args := []any{a.OrgID}
	df, args := dateFilter("ev.at", p, args)

	base := `FROM user_activity_events ev
	          JOIN users u ON u.id = ev.user_id
	         WHERE ev.organization_id = $1` + df

	q := `SELECT u.full_name AS agent_name, u.email AS agent_email,
	             ev.kind, ev.event, ev.detail, ev.at AS action_at
	      ` + base + fmt.Sprintf(" ORDER BY ev.at DESC LIMIT %d OFFSET %d", p.limit, p.offset)

	rows, err := s.queryMaps(r.Context(), q, args...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.countAndRespond(w, r, "SELECT count(*) "+base, rows, args)
}

// GET /api/system-logs/calls
func (s *server) handleLogCalls(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	p := parseLogParams(r)
	args := []any{a.OrgID}
	df, args := dateFilter("c.created_at", p, args)
	cf, args := convFilter("cv", p, args)

	base := `FROM calls c
	          LEFT JOIN conversations cv ON cv.id = c.conversation_id
	          LEFT JOIN contacts ct ON ct.id = cv.contact_id
	          LEFT JOIN users u ON u.id = c.agent_id
	         WHERE c.organization_id = $1` + df + cf

	q := `SELECT c.direction, ct.full_name AS name, c.contact_phone AS phone,
	             c.duration_seconds, c.created_at AS received_at, c.call_ended_at AS ended_at,
	             c.call_status, c.end_reason, u.full_name AS agent, c.id::text AS id,
	             c.recording_url AS recording_url
	      ` + base + fmt.Sprintf(" ORDER BY c.created_at DESC LIMIT %d OFFSET %d", p.limit, p.offset)

	rows, err := s.queryMaps(r.Context(), q, args...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.countAndRespond(w, r, "SELECT count(*) "+base, rows, args)
}
