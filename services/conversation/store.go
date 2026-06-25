package main

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type store struct{ pool *pgxpool.Pool }

type convMeta struct {
	OrgID      string
	Status     string
	AssignedTo *string
}

func (s *store) conversationMeta(ctx context.Context, convID string) (convMeta, error) {
	var m convMeta
	err := s.pool.QueryRow(ctx,
		`SELECT organization_id, status, assigned_agent_id
		   FROM conversations WHERE id = $1`,
		convID,
	).Scan(&m.OrgID, &m.Status, &m.AssignedTo)
	return m, err
}

type agent struct {
	ID   string
	Name string
}

// pickAgent memilih agen paling sedikit beban (round-robin least-loaded) di org.
// Hanya status akun (active) yang menentukan kelayakan distribusi lead; presence
// (is_online) bersifat kosmetik dan sengaja TIDAK memengaruhi pembagian lead.
func (s *store) pickAgent(ctx context.Context, orgID string) (agent, bool, error) {
	var a agent
	err := s.pool.QueryRow(ctx,
		`SELECT u.id, u.full_name
		   FROM users u
		  WHERE u.organization_id = $1
		    AND u.role IN ('agent','admin')
		    AND u.status = 'active'
		    AND u.is_deleted = false
		  ORDER BY (SELECT count(*) FROM conversations c
		              WHERE c.assigned_agent_id = u.id AND c.status <> 'closed') ASC,
		           u.last_seen_at ASC NULLS FIRST
		  LIMIT 1`,
		orgID,
	).Scan(&a.ID, &a.Name)
	if errors.Is(err, pgx.ErrNoRows) {
		return a, false, nil
	}
	if err != nil {
		return a, false, err
	}
	return a, true, nil
}

// isAssignableAgent reports whether agentID is an active, non-deleted user in the
// org — the minimum bar for a manual assign target.
func (s *store) isAssignableAgent(ctx context.Context, orgID, agentID string) bool {
	var ok bool
	_ = s.pool.QueryRow(ctx,
		`SELECT true FROM users WHERE id=$1::uuid AND organization_id=$2 AND is_deleted=false AND status='active'`,
		agentID, orgID).Scan(&ok)
	return ok
}

// assign menetapkan agen ke percakapan + mencatat audit. Idempoten secara aman.
func (s *store) assign(ctx context.Context, orgID, convID, agentID string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx,
		`UPDATE conversations
		    SET assigned_agent_id = $2,
		        status = 'open',
		        is_bot_active = false,
		        updated_at = now()
		  WHERE id = $1`,
		convID, agentID,
	)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx,
		`INSERT INTO conversation_events (organization_id, conversation_id, type, actor_type, actor_id, detail)
		 VALUES ($1, $2, 'assigned', 'system', $3, '{}')`,
		orgID, convID, agentID,
	)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// unassign releases a conversation (assigned_agent_id -> NULL) + audit. Used by a
// manager/admin to send a lead back to the unassigned queue.
func (s *store) unassign(ctx context.Context, orgID, convID, actorID string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err = tx.Exec(ctx,
		`UPDATE conversations SET assigned_agent_id = NULL, updated_at = now() WHERE id = $1`, convID); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx,
		`INSERT INTO conversation_events (organization_id, conversation_id, type, actor_type, actor_id, detail)
		 VALUES ($1, $2, 'unassigned', 'agent', NULLIF($3,'')::uuid, '{}')`,
		orgID, convID, actorID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// closeConversation menutup percakapan + audit.
func (s *store) closeConversation(ctx context.Context, orgID, convID, reason string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx,
		`UPDATE conversations
		    SET status = 'closed', closed_at = now(), closed_reason = $2,
		        is_bot_active = false, updated_at = now()
		  WHERE id = $1 AND status <> 'closed'`,
		convID, reason,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return tx.Commit(ctx) // sudah closed; tidak audit ganda
	}
	_, err = tx.Exec(ctx,
		`INSERT INTO conversation_events (organization_id, conversation_id, type, actor_type, detail)
		 VALUES ($1, $2, 'closed', 'system', jsonb_build_object('reason', $3::text))`,
		orgID, convID, reason,
	)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// idleConversations mengembalikan percakapan yang harus auto-close (idle).
func (s *store) idleConversations(ctx context.Context, idleHours int) ([]idleConv, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, organization_id FROM conversations
		  WHERE status NOT IN ('closed', 'snoozed')
		    AND last_message_at IS NOT NULL
		    AND last_message_at < now() - make_interval(hours => $1)`,
		idleHours,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []idleConv
	for rows.Next() {
		var c idleConv
		if err := rows.Scan(&c.ID, &c.OrgID); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

type idleConv struct {
	ID    string
	OrgID string
}

// snooze parks a conversation until `until`; the lifecycle ticker reopens it.
func (s *store) snooze(ctx context.Context, orgID, convID, actorID string, until string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx,
		`UPDATE conversations SET status='snoozed', snoozed_until=$2::timestamptz,
		   snooze_reminder_sent=false, updated_at=now() WHERE id=$1`,
		convID, until); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx,
		`INSERT INTO conversation_events (organization_id, conversation_id, type, actor_type, actor_id, detail)
		 VALUES ($1,$2,'snoozed','agent',NULLIF($3,'')::uuid, jsonb_build_object('until',$4::text))`,
		orgID, convID, actorID, until); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

type dueSnooze struct {
	ConvID, OrgID string
	AgentID       *string
	Contact       string
}

// dueSnoozes returns snoozed conversations whose timer has elapsed.
func (s *store) dueSnoozes(ctx context.Context) ([]dueSnooze, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT cv.id, cv.organization_id, cv.assigned_agent_id::text,
		        COALESCE(ct.full_name, ct.phone, 'a contact')
		   FROM conversations cv LEFT JOIN contacts ct ON ct.id = cv.contact_id
		  WHERE cv.status='snoozed' AND cv.snoozed_until IS NOT NULL AND cv.snoozed_until <= now()
		  LIMIT 200`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []dueSnooze
	for rows.Next() {
		var d dueSnooze
		if err := rows.Scan(&d.ConvID, &d.OrgID, &d.AgentID, &d.Contact); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// reopenSnoozed flips a due snooze back to open.
func (s *store) reopenSnoozed(ctx context.Context, convID string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE conversations SET status='open', snoozed_until=NULL, updated_at=now()
		  WHERE id=$1 AND status='snoozed'`, convID)
	return err
}

// addNotification inserts a bell notification for a user.
func (s *store) addNotification(ctx context.Context, orgID, userID, typ, title, body, convID string) {
	_, _ = s.pool.Exec(ctx,
		`INSERT INTO notifications (organization_id, user_id, type, title, body, conversation_id)
		 VALUES ($1,$2::uuid,$3,$4,NULLIF($5,''),NULLIF($6,'')::uuid)`,
		orgID, userID, typ, title, body, convID)
}

// ── Follow-up reminders (score + interest based) ────────────────────────────

type followUpDue struct {
	ConvID, OrgID string
	AgentID       string
	Contact       string
	Tier          string // priority | medium
	FreshWait     bool   // customer messaged after our last reminder -> reset cadence
}

// dueFollowUps returns open, human-handled leads whose assigned agent should be
// nudged to follow up. Tiering: a "priority" lead (hot OR lead_score>=70) is
// nudged after 30m of silence and re-nudged hourly (cap 4); a "medium" lead
// (warm OR 40<=score<70) after 2h, re-nudged every 4h (cap 2). Reminders stop
// once the agent replies (predicate), the lead closes/snoozes (status), or it
// goes stale (>48h). A new customer message resets the cadence (FreshWait).
func (s *store) dueFollowUps(ctx context.Context) ([]followUpDue, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT cv.id::text, cv.organization_id::text, cv.assigned_agent_id::text,
		       COALESCE(ct.full_name, ct.phone, 'a lead'),
		       CASE WHEN (cv.interest_level='hot' OR cv.lead_score >= 70) THEN 'priority' ELSE 'medium' END,
		       (cv.last_followup_notified_at IS NULL OR cv.last_contact_message_at > cv.last_followup_notified_at)
		  FROM conversations cv JOIN contacts ct ON ct.id = cv.contact_id
		 WHERE cv.status = 'open'
		   AND cv.assigned_agent_id IS NOT NULL
		   AND cv.last_contact_message_at IS NOT NULL
		   AND cv.last_contact_message_at > now() - interval '48 hours'
		   AND (cv.last_agent_message_at IS NULL OR cv.last_agent_message_at < cv.last_contact_message_at)
		   AND (
		        ( (cv.interest_level='hot' OR cv.lead_score >= 70)
		          AND cv.last_contact_message_at < now() - interval '30 minutes'
		          AND ( cv.last_followup_notified_at IS NULL
		             OR cv.last_contact_message_at > cv.last_followup_notified_at
		             OR (cv.followup_notify_count < 4 AND cv.last_followup_notified_at < now() - interval '60 minutes') ) )
		     OR ( (cv.interest_level='warm' OR (cv.lead_score >= 40 AND cv.lead_score < 70))
		          AND cv.last_contact_message_at < now() - interval '2 hours'
		          AND ( cv.last_followup_notified_at IS NULL
		             OR cv.last_contact_message_at > cv.last_followup_notified_at
		             OR (cv.followup_notify_count < 2 AND cv.last_followup_notified_at < now() - interval '4 hours') ) )
		   )
		 LIMIT 200`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []followUpDue
	for rows.Next() {
		var d followUpDue
		if err := rows.Scan(&d.ConvID, &d.OrgID, &d.AgentID, &d.Contact, &d.Tier, &d.FreshWait); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// markFollowUpNotified records that a reminder was just sent. A fresh wait resets
// the per-wait counter to 1; otherwise it increments.
func (s *store) markFollowUpNotified(ctx context.Context, convID string, freshWait bool) {
	if freshWait {
		_, _ = s.pool.Exec(ctx,
			`UPDATE conversations SET followup_notify_count=1, last_followup_notified_at=now() WHERE id=$1`, convID)
		return
	}
	_, _ = s.pool.Exec(ctx,
		`UPDATE conversations SET followup_notify_count=followup_notify_count+1, last_followup_notified_at=now() WHERE id=$1`,
		convID)
}

// ── Snooze pre-expiry reminders ─────────────────────────────────────────────

type snoozeReminderDue struct {
	ConvID, OrgID string
	AgentID       *string
	Contact       string
}

// dueSnoozeReminders returns snoozed leads that reopen within ~10 minutes and
// haven't been reminded yet (one-shot via snooze_reminder_sent).
func (s *store) dueSnoozeReminders(ctx context.Context) ([]snoozeReminderDue, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT cv.id::text, cv.organization_id::text, cv.assigned_agent_id::text,
		        COALESCE(ct.full_name, ct.phone, 'a contact')
		   FROM conversations cv LEFT JOIN contacts ct ON ct.id = cv.contact_id
		  WHERE cv.status='snoozed' AND cv.snoozed_until IS NOT NULL
		    AND cv.snooze_reminder_sent = false
		    AND cv.assigned_agent_id IS NOT NULL
		    AND cv.snoozed_until > now()
		    AND cv.snoozed_until <= now() + interval '10 minutes'
		  LIMIT 200`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []snoozeReminderDue
	for rows.Next() {
		var d snoozeReminderDue
		if err := rows.Scan(&d.ConvID, &d.OrgID, &d.AgentID, &d.Contact); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// markSnoozeReminded flips the one-shot flag so we don't re-remind every tick.
func (s *store) markSnoozeReminded(ctx context.Context, convID string) {
	_, _ = s.pool.Exec(ctx,
		`UPDATE conversations SET snooze_reminder_sent=true WHERE id=$1`, convID)
}
