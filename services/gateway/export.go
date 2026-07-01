package main

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
)

// ── GET /api/export/campaigns ────────────────────────────────
func (s *server) handleExportCampaigns(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())

	rows, err := s.queryMaps(r.Context(),
		`WITH stats AS (
		   SELECT campaign_id,
		          count(*) AS lead_count,
		          count(*) FILTER (WHERE status <> 'closed') AS active_leads,
		          count(*) FILTER (WHERE last_contact_message_at IS NOT NULL) AS replied,
		          count(*) FILTER (WHERE ai_stage IN ('high_intent','closing')) AS strong,
		          count(*) FILTER (WHERE ai_stage = 'won') AS won
		     FROM conversations WHERE organization_id=$1 GROUP BY campaign_id
		 )
		 SELECT c.name, c.status,
		        COALESCE(s.lead_count, 0) AS leads,
		        COALESCE(s.active_leads, 0) AS active_leads,
		        COALESCE(s.replied, 0) AS replied,
		        COALESCE(s.strong, 0) AS strong,
		        COALESCE(s.won, 0) AS won,
		        to_char(c.created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at
		   FROM campaigns c
		   LEFT JOIN stats s ON s.campaign_id = c.id
		  WHERE c.organization_id=$1 ORDER BY c.created_at DESC`,
		a.OrgID,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", "attachment; filename=\"campaigns_export.csv\"")

	cw := csv.NewWriter(w)
	_ = cw.Write([]string{"Campaign Name", "Status", "Leads Generated", "Active Leads", "Replied", "Strong Intent", "Won", "Created At"})

	for _, row := range rows {
		_ = cw.Write([]string{
			row["name"].(string),
			row["status"].(string),
			fmt.Sprintf("%v", row["leads"]),
			fmt.Sprintf("%v", row["active_leads"]),
			fmt.Sprintf("%v", row["replied"]),
			fmt.Sprintf("%v", row["strong"]),
			fmt.Sprintf("%v", row["won"]),
			row["created_at"].(string),
		})
	}
	cw.Flush()
}

// ── GET /api/export/team ─────────────────────────────────────
// Full team roster in the SmartKonek teams-export shape (teams-*.csv). Columns
// with no source in our schema (phone, created/updated by, SSO-only, external
// ref) are emitted empty rather than dropped, so the file stays drop-in.
func (s *server) handleExportTeam(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())

	tz := "Asia/Jakarta"
	_ = s.pool.QueryRow(r.Context(),
		`SELECT COALESCE(NULLIF(settings->>'timezone',''),'Asia/Jakarta') FROM organizations WHERE id=$1`, a.OrgID).Scan(&tz)

	rows, err := s.queryMaps(r.Context(),
		`SELECT u.full_name AS name, u.email,
		        '' AS phone, '' AS created_by, '' AS updated_by,
		        initcap(u.role) AS role,
		        to_char(u.created_at AT TIME ZONE $2, 'MM/DD/YYYY HH24:MI:SS') AS created_at,
		        to_char(u.updated_at AT TIME ZONE $2, 'MM/DD/YYYY HH24:MI:SS') AS updated_at,
		        CASE WHEN u.is_deleted OR u.is_inactive THEN 'false' ELSE 'true' END AS active_status,
		        COALESCE(to_char(u.last_seen_at AT TIME ZONE $2, 'MM/DD/YYYY HH24:MI:SS'), '') AS last_active,
		        'false' AS sso_only, '' AS external_ref
		   FROM users u
		  WHERE u.organization_id=$1 AND u.is_deleted = false
		  ORDER BY u.created_at DESC`,
		a.OrgID, tz,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=\"team_export.csv\"")
	_, _ = w.Write([]byte("\xEF\xBB\xBF")) // UTF-8 BOM for Excel

	cw := csv.NewWriter(w)
	_ = cw.Write([]string{
		"Name", "Email", "Phone Number", "Created By", "Updated By", "Role",
		"Created At", "Updated At", "Active Status", "Last Active",
		"Allow user to sso login only", "External Reference Id",
	})
	keys := []string{"name", "email", "phone", "created_by", "updated_by", "role",
		"created_at", "updated_at", "active_status", "last_active", "sso_only", "external_ref"}
	for _, row := range rows {
		rec := make([]string, len(keys))
		for i, k := range keys {
			if v := row[k]; v != nil {
				rec[i] = fmt.Sprintf("%v", v)
			}
		}
		_ = cw.Write(rec)
	}
	cw.Flush()
}

// ── GET /api/export/chats ────────────────────────────────────
func (s *server) handleExportChats(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())

	// Fetch conversation history with SLA metrics
	rows, err := s.queryMaps(r.Context(),
		`WITH fr AS (
		   SELECT conversation_id, min(created_at) AS t_c FROM messages
		    WHERE organization_id=$1 AND direction='inbound' AND sender_type='contact'
		    GROUP BY conversation_id
		 ),
		 rt AS (
		   SELECT fr.conversation_id, EXTRACT(EPOCH FROM (min(m.created_at)-fr.t_c))/60.0 AS rt_min
		     FROM fr JOIN messages m ON m.conversation_id=fr.conversation_id
		            AND m.direction='outbound' AND m.created_at>fr.t_c AND m.organization_id=$1
		    GROUP BY fr.conversation_id, fr.t_c
		 )
		 SELECT cv.id, cv.status, cv.is_bot_active, cv.interest_level, cv.ai_stage,
		        COALESCE(st.name, '-') AS stage_name,
		        COALESCE(dp.name, '-') AS disposition_name,
		        cv.car_brand, cv.car_model, cv.city, cv.purchase_timeframe, cv.lost_reason,
		        cv.followup_count, cv.call_attempts, cv.total_call_duration,
		        COALESCE(rt.rt_min, 0) AS first_response_time_min,
		        to_char(cv.created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at
		   FROM conversations cv
		   LEFT JOIN stages st ON st.id = cv.stage_id
		   LEFT JOIN dispositions dp ON dp.id = cv.disposition_id
		   LEFT JOIN rt ON rt.conversation_id = cv.id
		  WHERE cv.organization_id=$1 ORDER BY cv.created_at DESC`,
		a.OrgID,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", "attachment; filename=\"chats_export.csv\"")

	cw := csv.NewWriter(w)
	_ = cw.Write([]string{
		"Conversation ID", "Status", "AI Handled", "Interest Level", "Pipeline Stage", "Disposition",
		"Car Brand", "Car Model", "City", "Purchase Timeframe", "Lost Reason",
		"Follow-up Count", "Call Attempts", "Call Duration (sec)", "First Response Time (min)", "Created At",
	})

	for _, row := range rows {
		_ = cw.Write([]string{
			fmt.Sprintf("%v", row["id"]),
			fmt.Sprintf("%v", row["status"]),
			fmt.Sprintf("%v", row["is_bot_active"]),
			fmt.Sprintf("%v", row["interest_level"]),
			fmt.Sprintf("%v", row["stage_name"]),
			fmt.Sprintf("%v", row["disposition_name"]),
			fmt.Sprintf("%v", row["car_brand"]),
			fmt.Sprintf("%v", row["car_model"]),
			fmt.Sprintf("%v", row["city"]),
			fmt.Sprintf("%v", row["purchase_timeframe"]),
			fmt.Sprintf("%v", row["lost_reason"]),
			fmt.Sprintf("%v", row["followup_count"]),
			fmt.Sprintf("%v", row["call_attempts"]),
			fmt.Sprintf("%v", row["total_call_duration"]),
			strconv.FormatFloat(row["first_response_time_min"].(float64), 'f', 2, 64),
			fmt.Sprintf("%v", row["created_at"]),
		})
	}
	cw.Flush()
}
