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
		Kind string `json:"kind"`
		From string `json:"from"`
		To   string `json:"to"`
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
		`INSERT INTO export_jobs (id, organization_id, requested_by, kind, date_from, date_to, status)
		 VALUES ($1,$2,$3::uuid,$4, NULLIF($5,'')::date, NULLIF($6,'')::date, 'queued')`,
		jobID, a.OrgID, a.UserID, b.Kind, b.From, b.To); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	go s.runExport(jobID, a.OrgID, b.Kind, b.From, b.To)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"id": jobID, "status": "queued"})
}

// GET /api/exports
func (s *server) handleListExports(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	rows, err := s.queryMaps(r.Context(),
		`SELECT e.id::text, e.kind, e.date_from, e.date_to, e.status, e.row_count, e.file_url,
		        e.error, e.expires_at, e.created_at, e.completed_at, u.full_name AS requested_by
		   FROM export_jobs e LEFT JOIN users u ON u.id = e.requested_by
		  WHERE e.organization_id = $1 ORDER BY e.created_at DESC LIMIT 100`, a.OrgID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

// runExport generates the full CSV for the job and flips its status (background).
func (s *server) runExport(jobID, orgID, kind, from, to string) {
	ctx := context.Background()
	_, _ = s.pool.Exec(ctx, `UPDATE export_jobs SET status='processing' WHERE id=$1`, jobID)

	q, cols := exportQuery(kind)
	if q == "" {
		s.failExport(ctx, jobID, "unknown export kind")
		return
	}
	args := []any{orgID}
	df, args := dateFilter(exportDateCol(kind), logParams{from: from, to: to}, args)
	q = fmt.Sprintf(q, df)

	rows, err := s.queryMaps(ctx, q, args...)
	if err != nil {
		s.failExport(ctx, jobID, err.Error())
		return
	}

	var buf bytes.Buffer
	cw := csv.NewWriter(&buf)
	_ = cw.Write(cols)
	for _, row := range rows {
		rec := make([]string, len(cols))
		for i, c := range cols {
			rec[i] = csvVal(row[c])
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

func csvVal(v any) string {
	switch x := v.(type) {
	case nil:
		return ""
	case time.Time:
		return x.Format(time.RFC3339)
	case string:
		return x
	default:
		return fmt.Sprintf("%v", x)
	}
}

func exportDateCol(kind string) string {
	switch kind {
	case "messages":
		return "m.created_at"
	case "conversations":
		return "cv.created_at"
	case "calls":
		return "c.created_at"
	case "activity":
		return "ev.at"
	}
	return "created_at"
}

// exportQuery returns SQL with a single %s placeholder for the date filter, plus
// the ordered column list. Mirrors the system-log queries but unbounded (all rows).
func exportQuery(kind string) (string, []string) {
	switch kind {
	case "messages":
		return `SELECT m.created_at, m.direction, m.type AS message_type, m.body AS message,
		             m.media_url AS file_url, m.status, COALESCE(m.external_id, m.id::text) AS message_id,
		             cv.id::text AS conversation_id, ch.name AS channel_name,
		             ct.full_name AS contact_name, ct.phone AS contact_phone,
		             u.full_name AS agent_name, u.email AS agent_email
		      FROM messages m
		          JOIN conversations cv ON cv.id = m.conversation_id
		          LEFT JOIN contacts ct ON ct.id = cv.contact_id
		          LEFT JOIN users u ON u.id = m.sender_id
		          LEFT JOIN channels ch ON ch.id = cv.channel_id
		         WHERE m.organization_id = $1%s ORDER BY m.created_at DESC`,
			[]string{"created_at", "direction", "message_type", "message", "file_url", "status", "message_id", "conversation_id", "channel_name", "contact_name", "contact_phone", "agent_name", "agent_email"}
	case "conversations":
		return `SELECT u.full_name AS agent_name, u.email AS email, d.name AS department_name,
		             ct.full_name AS customer_name, disp.name AS disposition, ct.phone AS contact_number,
		             cv.created_at AS assigned_at, cv.closed_at,
		             COALESCE(EXTRACT(EPOCH FROM (cv.first_responsed_at - cv.created_at))::int, 0) AS first_response_sec,
		             COALESCE(EXTRACT(EPOCH FROM (cv.closed_at - cv.created_at))::int, 0) AS closing_sec,
		             (SELECT count(*) FROM messages mm WHERE mm.conversation_id = cv.id AND mm.direction='outbound' AND mm.sender_type='agent')::int AS agent_messages,
		             cv.status, cv.created_at AS chat_initiation, cv.id::text AS id
		      FROM conversations cv
		          LEFT JOIN users u ON u.id = cv.assigned_agent_id
		          LEFT JOIN departments d ON d.id = cv.department_id
		          LEFT JOIN contacts ct ON ct.id = cv.contact_id
		          LEFT JOIN dispositions disp ON disp.id = cv.disposition_id
		         WHERE cv.organization_id = $1%s ORDER BY cv.created_at DESC`,
			[]string{"agent_name", "email", "department_name", "customer_name", "disposition", "contact_number", "assigned_at", "closed_at", "first_response_sec", "closing_sec", "agent_messages", "status", "chat_initiation", "id"}
	case "calls":
		return `SELECT c.direction, ct.full_name AS name, c.contact_phone AS phone,
		             c.duration_seconds, c.created_at AS received_at, c.call_ended_at AS ended_at,
		             c.call_status, c.end_reason, u.full_name AS agent, c.id::text AS id
		      FROM calls c
		          LEFT JOIN conversations cv ON cv.id = c.conversation_id
		          LEFT JOIN contacts ct ON ct.id = cv.contact_id
		          LEFT JOIN users u ON u.id = c.agent_id
		         WHERE c.organization_id = $1%s ORDER BY c.created_at DESC`,
			[]string{"direction", "name", "phone", "duration_seconds", "received_at", "ended_at", "call_status", "end_reason", "agent", "id"}
	case "activity":
		return `SELECT u.full_name AS agent_name, u.email AS agent_email,
		             ev.kind, ev.event, ev.detail, ev.at AS action_at
		      FROM user_activity_events ev
		          JOIN users u ON u.id = ev.user_id
		         WHERE ev.organization_id = $1%s ORDER BY ev.at DESC`,
			[]string{"agent_name", "agent_email", "kind", "event", "detail", "action_at"}
	}
	return "", nil
}
