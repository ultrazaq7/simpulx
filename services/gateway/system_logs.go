package main

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
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
// Both accept a comma-separated list of ids (the logs filters are multi-select),
// matched with ANY() so one or many ids work the same way.
func convFilter(alias string, p logParams, args []any) (string, []any) {
	clause := ""
	if p.campaignID != "" {
		args = append(args, strings.Split(p.campaignID, ","))
		clause += fmt.Sprintf(" AND %s.campaign_id = ANY($%d::uuid[])", alias, len(args))
	}
	if p.channelID != "" {
		args = append(args, strings.Split(p.channelID, ","))
		clause += fmt.Sprintf(" AND %s.channel_id = ANY($%d::uuid[])", alias, len(args))
	}
	return clause, args
}

// logScope narrows a system-log query to the campaigns the caller belongs to.
//
// Every handler in this file used to scope on organization_id ALONE, with no
// role check anywhere: `campaign_id` came from the query string, i.e. from the
// user, so it filtered but never restricted. A manager or any campaign-bound
// role could therefore read every message body, contact phone/email, call and
// transcript in the whole org, including campaigns they are not a member of.
// That is the exact opposite of the campaign-isolation rule (BR-40/41/42), which
// is meant to hold at the query layer.
//
// alias is the conversations alias the rows hang off. Reuses managerScope so
// logs, inbox and reports all answer "which campaigns are mine" identically -- a
// second definition here would be one more place to forget branch membership.
// orgWideCampaignView is deliberately restrictive by default: only owner/admin
// see everything, and an unrecognised role gets the narrow view.
func logScope(a authInfo, alias string, args []any) (string, []any) {
	if orgWideCampaignView(a) {
		return "", args
	}
	args = append(args, a.UserID)
	return " AND " + managerScope(alias, len(args)), args
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
	sc, args := logScope(a, "cv", args)
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
	          LEFT JOIN campaigns cmpm ON cmpm.id = cv.campaign_id
	          LEFT JOIN campaign_branches brm ON brm.id = cv.branch_id
	          LEFT JOIN LATERAL (
	            SELECT referral_source, referral_url FROM conversation_attributions
	             WHERE conversation_id = cv.id ORDER BY created_at DESC LIMIT 1
	          ) att ON true
	         WHERE m.organization_id = $1` + df + cf + sc + lf

	q := `SELECT m.created_at, m.direction, m.type AS message_type, m.body AS message,
	             m.media_url AS file_url, m.status, COALESCE(m.external_id, m.id::text) AS message_id,
	             cv.id::text AS conversation_id, cv.channel_id::text AS channel_id, ch.name AS channel_name,
	             cv.contact_id::text AS contact_id, ct.full_name AS contact_name, ct.phone AS contact_phone,
	             ct.email AS contact_email, COALESCE(brm.name, cmpm.name) AS campaign_name,
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
	sc, args := logScope(a, "cv", args)

	// Shared joins. assigned_at = first 'assigned' event; avg_response_sec = mean
	// gap from each customer message to the agent's next reply (window pass over
	// the thread). LATERALs must sit in FROM, before WHERE.
	joins := `FROM conversations cv
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
	          ) rt ON true`
	where := ` WHERE cv.organization_id = $1` + df + cf + sc
	sel := `SELECT u.full_name AS agent_name, u.email AS agent_email,
	             COALESCE(br.name, cmp.name) AS campaign_name,
	             ct.full_name AS customer_name, ct.phone AS contact_number,
	             st.name AS stage, cv.interest_level AS interest_level,
	             cv.created_at AS chat_initiation, asg.assigned_at AS assigned_at,
	             COALESCE(EXTRACT(EPOCH FROM (cv.first_responsed_at - cv.created_at))::int, 0) AS first_response_sec,
	             COALESCE(rt.avg_sec, 0) AS avg_response_sec,
	             cv.closed_at AS closing_at, cv.status, cv.id::text AS id
	      ` + joins + where
	q := sel + fmt.Sprintf(" ORDER BY cv.created_at DESC LIMIT %d OFFSET %d", p.limit, p.offset)
	// Count on a lean FROM (no LATERALs — they don't change the row count).
	countBase := `FROM conversations cv WHERE cv.organization_id = $1` + df + cf + sc

	rows, err := s.queryMaps(r.Context(), q, args...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.countAndRespond(w, r, "SELECT count(*) "+countBase, rows, args)
}

// GET /api/system-logs/activity — agent presence / lifecycle events.
func (s *server) handleLogActivity(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	p := parseLogParams(r)
	args := []any{a.OrgID}
	df, args := dateFilter("ev.at", p, args)

	// Activity rows hang off a USER, not a conversation, so campaign membership is
	// expressed as "people I share a campaign or branch with" (plus yourself, so a
	// manager with no co-members still sees their own history). Mirrors the same
	// predicate the team/agent-performance query already uses.
	sc := ""
	if !orgWideCampaignView(a) {
		args = append(args, a.UserID)
		i := len(args)
		sc = fmt.Sprintf(` AND (ev.user_id = $%d OR ev.user_id IN (
		    SELECT user_id FROM campaign_agents WHERE campaign_id IN (SELECT campaign_id FROM campaign_agents WHERE user_id = $%d)
		    UNION
		    SELECT user_id FROM branch_agents WHERE branch_id IN (SELECT branch_id FROM branch_agents WHERE user_id = $%d)))`, i, i, i)
	}

	base := `FROM user_activity_events ev
	          JOIN users u ON u.id = ev.user_id
	         WHERE ev.organization_id = $1` + df + sc

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
	// A call whose conversation_id is NULL cannot be attributed to a campaign, so
	// the scope predicate drops it for campaign-bound roles. That is the intended
	// direction: an unattributable call is not evidence that it belongs to you.
	sc, args := logScope(a, "cv", args)

	base := `FROM calls c
	          LEFT JOIN conversations cv ON cv.id = c.conversation_id
	          LEFT JOIN contacts ct ON ct.id = cv.contact_id
	          LEFT JOIN users u ON u.id = c.agent_id
	         WHERE c.organization_id = $1` + df + cf + sc

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
