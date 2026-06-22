package main

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/simpulx/v2/libs/go/events"
)

// logUserActivity appends one row to the append-only user_activity_events log
// (presence + lifecycle transitions; source for agent-performance metrics and
// billing spans). Best-effort: a metrics-history write must never break the
// operational change that triggered it. Callers log only on a real state change.
func (s *server) logUserActivity(ctx context.Context, orgID, userID, actorID, kind, event string, detail map[string]any) {
	detailStr := ""
	if detail != nil {
		if b, err := json.Marshal(detail); err == nil {
			detailStr = string(b)
		}
	}
	_, _ = s.pool.Exec(ctx,
		`INSERT INTO user_activity_events (organization_id, user_id, kind, event, actor_id, detail)
		 VALUES ($1, $2, $3, $4, NULLIF($5,'')::uuid, NULLIF($6,'')::jsonb)`,
		orgID, userID, kind, event, actorID, detailStr)
}

// ── Users (org user accounts) ───────────────────────────────
// Org-level user/agent accounts. Roles are a fixed RBAC catalog
// (owner|admin|manager|agent); per-campaign agent assignment is
// handled separately at the campaign level.

// GET /api/users — enriched for the People table: campaign names, last login,
// and open-chat load. Aggregated via subqueries so a user with no campaigns
// still returns one row.
func (s *server) handleListUsers(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	rows, err := s.queryMaps(r.Context(),
		`SELECT u.id::text AS id, u.full_name, u.email, u.role, u.status, u.is_online,
		        u.is_inactive, u.inactive_since, u.is_deleted,
		        u.last_seen_at, u.last_login_at, u.created_at,
		        COALESCE((SELECT array_agg(c.name ORDER BY c.name)
		                    FROM campaign_agents ca JOIN campaigns c ON c.id = ca.campaign_id
		                   WHERE ca.user_id = u.id), '{}') AS campaign_names,
		        (SELECT count(*) FROM conversations c WHERE c.assigned_agent_id = u.id AND c.status <> 'closed') AS open_chats
		   FROM users u
		  WHERE u.organization_id = $1 AND u.is_deleted = false
		  ORDER BY u.created_at`,
		a.OrgID,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

// POST /api/users {email, full_name, role, password}
func (s *server) handleCreateUser(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var b struct {
		Email    string `json:"email"`
		FullName string `json:"full_name"`
		Role     string `json:"role"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil || b.Email == "" || b.FullName == "" {
		http.Error(w, "email & full_name required", http.StatusBadRequest)
		return
	}
	if b.Role == "" {
		b.Role = "agent"
	}
	if b.Password == "" {
		b.Password = "changeme123" // dev default; real invite flow sends a set-password link
	}
	hash, err := hashPassword(b.Password)
	if err != nil {
		http.Error(w, "hash error", http.StatusInternalServerError)
		return
	}
	var id string
	err = s.pool.QueryRow(r.Context(),
		`INSERT INTO users (organization_id, email, password_hash, full_name, role, status)
		 VALUES ($1,$2,$3,$4,$5,'active') RETURNING id::text`,
		a.OrgID, b.Email, hash, b.FullName, b.Role,
	).Scan(&id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.audit(r.Context(), a, "created", "user", id, map[string]any{"email": b.Email, "role": b.Role})
	writeJSON(w, map[string]any{"id": id})
}

// PATCH /api/users/{id} {full_name?, email?, role?, status?, password?}
// Admins/owners can change a user's email and reset their password from here;
// agents/managers may only edit their own profile and never role/status. Email
// and password are optional and only touched when a non-empty value is sent.
// reassignLeadsFrom redistributes a user's OPEN conversations when they are
// deactivated or deleted: each lead goes to the least-loaded active, in_rotation
// agent in its branch (else its campaign), excluding the departing user. If none
// qualify the lead is left unassigned. Closed conversations keep their original
// agent for reporting. Best-effort: errors are logged, never fatal.
func (s *server) reassignLeadsFrom(ctx context.Context, orgID, userID, actorID, reason string) {
	rows, err := s.pool.Query(ctx,
		`SELECT id::text, campaign_id::text, branch_id::text FROM conversations
		   WHERE organization_id=$1 AND assigned_agent_id=$2 AND status <> 'closed'`, orgID, userID)
	if err != nil {
		s.log.Error("reassign leads: list", "err", err)
		return
	}
	type lead struct {
		id       string
		campaign *string
		branch   *string
	}
	var leads []lead
	for rows.Next() {
		var l lead
		if err := rows.Scan(&l.id, &l.campaign, &l.branch); err == nil {
			leads = append(leads, l)
		}
	}
	rows.Close()

	for _, l := range leads {
		// Least-loaded eligible agent in the lead's branch (else its campaign).
		var newAgent *string
		_ = s.pool.QueryRow(ctx,
			`SELECT u.id::text FROM users u
			  WHERE u.organization_id=$1 AND u.is_deleted=false AND u.status='active' AND u.id <> $2::uuid
			    AND ( ($3::uuid IS NOT NULL AND u.id IN (SELECT user_id FROM branch_agents WHERE branch_id=$3::uuid AND in_rotation))
			       OR ($3::uuid IS NULL AND $4::uuid IS NOT NULL AND u.id IN (SELECT user_id FROM campaign_agents WHERE campaign_id=$4::uuid AND in_rotation)) )
			  ORDER BY (SELECT count(*) FROM conversations cc WHERE cc.assigned_agent_id=u.id AND cc.status<>'closed') ASC, random()
			  LIMIT 1`,
			orgID, userID, l.branch, l.campaign).Scan(&newAgent)

		if _, err := s.pool.Exec(ctx,
			`UPDATE conversations SET assigned_agent_id=$2::uuid, updated_at=now() WHERE id=$1`,
			l.id, newAgent); err != nil {
			s.log.Error("reassign leads: update", "conv", l.id, "err", err)
			continue
		}
		evType := "assigned"
		if newAgent == nil {
			evType = "unassigned"
		}
		_, _ = s.pool.Exec(ctx,
			`INSERT INTO conversation_events (organization_id, conversation_id, type, actor_type, actor_id, detail)
			 VALUES ($1,$2,$3,'agent',$4::uuid, jsonb_build_object('reason',$5::text,'previous_agent_id',$6::uuid,'new_agent_id',$7::uuid))`,
			orgID, l.id, evType, actorID, reason, userID, newAgent)
	}
}

func (s *server) handleUpdateUser(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	targetID := r.PathValue("id")
	var b struct {
		FullName  *string `json:"full_name"`
		Email     *string `json:"email"`
		Role      *string `json:"role"`
		Status    *string `json:"status"`
		Password  *string `json:"password"`
		AvatarURL *string `json:"avatar_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	// Only admins/owners may change role, status, email, or another user's password.
	isPrivileged := a.Role == "admin" || a.Role == "owner"
	if !isPrivileged {
		if targetID != a.UserID {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		b.Role = nil
		b.Status = nil // non-privileged users can only edit their own name
	}

	// Optional password reset -> hash before storing.
	var pwHash string
	if b.Password != nil && *b.Password != "" {
		if len(*b.Password) < 8 {
			http.Error(w, "password must be at least 8 characters", http.StatusBadRequest)
			return
		}
		h, err := hashPassword(*b.Password)
		if err != nil {
			http.Error(w, "hash error", http.StatusInternalServerError)
			return
		}
		pwHash = h
	}

	// CTE returns the prior status so we can log a lifecycle transition only when
	// it actually changed (keeps the activity log free of no-op repeats).
	var prevStatus string
	err := s.pool.QueryRow(r.Context(),
		`WITH prev AS (
		   SELECT status FROM users
		    WHERE id=$1 AND organization_id=$2 AND is_deleted = false FOR UPDATE
		 )
		 UPDATE users u SET
		   full_name     = COALESCE(NULLIF($3,''), u.full_name),
		   email         = COALESCE(NULLIF($4,''), u.email),
		   role          = COALESCE(NULLIF($5,''), u.role),
		   status        = COALESCE(NULLIF($6,''), u.status),
		   -- Keep the billing flags in sync whenever status is (re)set.
		   is_inactive    = CASE WHEN NULLIF($6,'') IS NULL THEN u.is_inactive
		                         WHEN $6 = 'inactive' THEN true ELSE false END,
		   inactive_since = CASE WHEN NULLIF($6,'') IS NULL THEN u.inactive_since
		                         WHEN $6 = 'inactive' THEN COALESCE(u.inactive_since, now())
		                         ELSE NULL END,
		   password_hash = COALESCE(NULLIF($7,''), u.password_hash),
		   avatar_url    = COALESCE(NULLIF($8,''), u.avatar_url),
		   updated_at = now()
		 FROM prev
		 WHERE u.id=$1 AND u.organization_id=$2 AND u.is_deleted = false
		 RETURNING prev.status`,
		targetID, a.OrgID, derefStr(b.FullName), derefStr(b.Email),
		derefStr(b.Role), derefStr(b.Status), pwHash, derefStr(b.AvatarURL)).Scan(&prevStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Log active/inactive lifecycle transition (for billing spans + metrics).
	if newStatus := derefStr(b.Status); newStatus != "" && newStatus != prevStatus &&
		(newStatus == "active" || newStatus == "inactive") {
		s.logUserActivity(r.Context(), a.OrgID, targetID, a.UserID, "lifecycle", newStatus, nil)
	}

	// 4.2 Ownership Lifecycle: Bulk reassign (unset) leads if agent is deactivated
	if b.Status != nil && *b.Status == "inactive" {
		s.reassignLeadsFrom(r.Context(), a.OrgID, targetID, a.UserID, "agent_deactivated")

		// Broadcast deactivation so realtime service can kick them
		_ = s.bus.Publish(events.SubjectAgentDeactivated, a.OrgID, events.AgentDeactivated{
			AgentID: targetID,
		})
	}
	detail := map[string]any{}
	if b.Email != nil && *b.Email != "" {
		detail["email_changed"] = true
	}
	if pwHash != "" {
		detail["password_reset"] = true
	}
	s.audit(r.Context(), a, "updated", "user", targetID, detail)
	writeJSON(w, map[string]any{"status": "updated"})
}

// PATCH /api/users/me/presence {online: bool}
// Self presence (online/offline). Any authenticated user may set their own
// presence; this writes `is_online`/`last_seen_at` only and never touches the
// account `status` (active/inactive) used by login and routing gates.
func (s *server) handleSetPresence(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var b struct {
		Online bool `json:"online"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	// Only writes (and logs) on a real transition, so the activity log holds
	// clean online/offline sessions for metrics.
	tag, err := s.pool.Exec(r.Context(),
		`UPDATE users SET is_online = $3, last_seen_at = now(), updated_at = now()
		   WHERE id = $1 AND organization_id = $2 AND is_online <> $3`,
		a.UserID, a.OrgID, b.Online)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() > 0 {
		event := "offline"
		if b.Online {
			event = "online"
		}
		s.logUserActivity(r.Context(), a.OrgID, a.UserID, a.UserID, "presence", event, nil)
	}
	writeJSON(w, map[string]any{"is_online": b.Online})
}

// DELETE /api/users/{id}
// Soft delete: we never physically remove the row, so historical attribution
// (audit actor, who handled past conversations, created_by, etc.) is preserved.
// Instead we tombstone it — set deleted_at, force the account inactive (keeps
// them out of login + lead routing), drop presence, and free the email for
// reuse by suffixing it. Active leads are reassigned with an audit event and a
// realtime kick, mirroring deactivation.
func (s *server) handleDeleteUser(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	targetID := r.PathValue("id")
	if targetID == a.UserID {
		http.Error(w, "cannot delete yourself", http.StatusBadRequest)
		return
	}
	tag, err := s.pool.Exec(r.Context(),
		`UPDATE users SET
		   status         = 'inactive',
		   is_inactive    = true,
		   inactive_since = COALESCE(inactive_since, now()),
		   is_deleted     = true,
		   deleted_at     = now(),
		   is_online      = false,
		   email          = email || '+deleted-' || id::text,
		   updated_at     = now()
		 WHERE id=$1 AND organization_id=$2 AND is_deleted = false`,
		targetID, a.OrgID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	// Lifecycle transition -> ends the account's active/billable span.
	s.logUserActivity(r.Context(), a.OrgID, targetID, a.UserID, "lifecycle", "deleted", nil)

	// Release any open leads they own, leaving an audit trail (same as deactivate).
	s.reassignLeadsFrom(r.Context(), a.OrgID, targetID, a.UserID, "agent_deleted")

	// Kick them from realtime sessions.
	_ = s.bus.Publish(events.SubjectAgentDeactivated, a.OrgID, events.AgentDeactivated{
		AgentID: targetID,
	})

	s.audit(r.Context(), a, "deleted", "user", targetID, nil)
	writeJSON(w, map[string]any{"status": "deleted"})
}

// GET /api/users/{id}/activity?from=&to=
// Agent-performance + billing metrics derived from the user_activity_events log.
// Sessions are reconstructed from online/offline (presence) and active/inactive/
// deleted (lifecycle) transitions and clipped to the [from,to] window, so a
// session that straddles the window edges is counted only for its overlap.
// Visibility: self always; admin/owner/manager may view any user in the org.
func (s *server) handleUserActivity(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	targetID := r.PathValue("id")
	// Visibility: self always; admin/owner any user; manager only agents that
	// share a campaign with them (same scoping as GET /api/agents).
	if targetID != a.UserID {
		switch a.Role {
		case "admin", "owner":
			// any user in the org
		case "manager":
			var shared bool
			_ = s.pool.QueryRow(r.Context(),
				`SELECT EXISTS (
				   SELECT 1 FROM campaign_agents ca
				    WHERE ca.user_id = $1
				      AND ca.campaign_id IN (SELECT campaign_id FROM campaign_agents WHERE user_id = $2))
				   OR EXISTS (
				   SELECT 1 FROM branch_agents ba
				    WHERE ba.user_id = $1
				      AND ba.branch_id IN (SELECT branch_id FROM branch_agents WHERE user_id = $2))`,
				targetID, a.UserID).Scan(&shared)
			if !shared {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
		default:
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
	}

	// Window: default last 30 days. Accepts RFC3339 from/to.
	to := time.Now()
	from := to.AddDate(0, 0, -30)
	if v := r.URL.Query().Get("to"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			to = t
		}
	}
	if v := r.URL.Query().Get("from"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			from = t
		}
	}

	// Presence: online time + session count within the window.
	var onlineSeconds, sessions float64
	if err := s.pool.QueryRow(r.Context(),
		`WITH presence AS (
		   SELECT event, at, LEAD(at) OVER (ORDER BY at) AS next_at
		     FROM user_activity_events
		    WHERE user_id = $1 AND organization_id = $2 AND kind = 'presence' AND at <= $4
		 ),
		 seg AS (
		   SELECT GREATEST(at, $3) AS s, LEAST(COALESCE(next_at, now()), $4) AS e
		     FROM presence WHERE event = 'online'
		 )
		 SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (e - s))) FILTER (WHERE e > s), 0),
		        COALESCE(COUNT(*) FILTER (WHERE e > s), 0)
		   FROM seg`,
		targetID, a.OrgID, from, to).Scan(&onlineSeconds, &sessions); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Current presence + billing flags + last time they came online.
	var currentlyOnline, isInactive, isDeleted bool
	var lastOnline *time.Time
	if err := s.pool.QueryRow(r.Context(),
		`SELECT is_online, is_inactive, is_deleted,
		        (SELECT max(at) FROM user_activity_events
		          WHERE user_id = $1 AND kind = 'presence' AND event = 'online')
		   FROM users WHERE id = $1 AND organization_id = $2`,
		targetID, a.OrgID).Scan(&currentlyOnline, &isInactive, &isDeleted, &lastOnline); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Billing: active span within the window (created_at seeds the first 'active').
	var activeSeconds float64
	_ = s.pool.QueryRow(r.Context(),
		`WITH life AS (
		   SELECT event, at, LEAD(at) OVER (ORDER BY at) AS next_at FROM (
		     SELECT 'active'::text AS event, created_at AS at
		       FROM users WHERE id = $1 AND organization_id = $2
		     UNION ALL
		     SELECT event, at FROM user_activity_events
		      WHERE user_id = $1 AND organization_id = $2 AND kind = 'lifecycle' AND at <= $4
		   ) z
		 ),
		 seg AS (
		   SELECT GREATEST(at, $3) AS s, LEAST(COALESCE(next_at, now()), $4) AS e
		     FROM life WHERE event = 'active'
		 )
		 SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (e - s))) FILTER (WHERE e > s), 0) FROM seg`,
		targetID, a.OrgID, from, to).Scan(&activeSeconds)

	windowSeconds := to.Sub(from).Seconds()
	availability := 0.0
	if windowSeconds > 0 {
		availability = math.Min(100, onlineSeconds/windowSeconds*100)
	}

	writeJSON(w, map[string]any{
		"user_id": targetID,
		"from":    from,
		"to":      to,
		"presence": map[string]any{
			"currently_online": currentlyOnline,
			"online_seconds":   int64(onlineSeconds),
			"online_hours":     math.Round(onlineSeconds/3600*100) / 100,
			"availability_pct": math.Round(availability*10) / 10,
			"sessions":         int64(sessions),
			"last_online_at":   lastOnline,
		},
		"billing": map[string]any{
			"active_seconds": int64(activeSeconds),
			"active_days":    math.Round(activeSeconds/86400*100) / 100,
			"is_inactive":    isInactive,
			"is_deleted":     isDeleted,
		},
	})
}

// POST /api/users/fcm-token {token, platform}
func (s *server) handleRegisterFCMToken(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var b struct {
		Token    string `json:"token"`
		Platform string `json:"platform"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil || b.Token == "" {
		http.Error(w, "token required", http.StatusBadRequest)
		return
	}

	_, err := s.pool.Exec(r.Context(),
		`INSERT INTO fcm_tokens (user_id, token, platform)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (user_id, token) DO UPDATE SET platform = EXCLUDED.platform, created_at = now()`,
		a.UserID, b.Token, b.Platform)

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"status": "registered"})
}
