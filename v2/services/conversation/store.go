package main

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type store struct{ pool *pgxpool.Pool }

type convMeta struct {
	OrgID        string
	DepartmentID *string
	Status       string
	AssignedTo   *string
}

func (s *store) conversationMeta(ctx context.Context, convID string) (convMeta, error) {
	var m convMeta
	err := s.pool.QueryRow(ctx,
		`SELECT organization_id, department_id, status, assigned_agent_id
		   FROM conversations WHERE id = $1`,
		convID,
	).Scan(&m.OrgID, &m.DepartmentID, &m.Status, &m.AssignedTo)
	return m, err
}

type agent struct {
	ID   string
	Name string
}

// pickAgent memilih agen paling sedikit beban (round-robin least-loaded),
// mengutamakan yang online, dalam scope department bila ada.
func (s *store) pickAgent(ctx context.Context, orgID string, departmentID *string) (agent, bool, error) {
	var a agent
	var dept any
	if departmentID != nil {
		dept = *departmentID
	}
	err := s.pool.QueryRow(ctx,
		`SELECT u.id, u.full_name
		   FROM users u
		  WHERE u.organization_id = $1
		    AND u.role IN ('agent','admin')
		    AND u.status = 'active'
		    AND ($2::uuid IS NULL OR EXISTS (
		          SELECT 1 FROM agent_departments ad
		           WHERE ad.user_id = u.id AND ad.department_id = $2::uuid))
		  ORDER BY u.is_online DESC,
		           (SELECT count(*) FROM conversations c
		              WHERE c.assigned_agent_id = u.id AND c.status <> 'closed') ASC,
		           u.last_seen_at ASC NULLS FIRST
		  LIMIT 1`,
		orgID, dept,
	).Scan(&a.ID, &a.Name)
	if errors.Is(err, pgx.ErrNoRows) {
		return a, false, nil
	}
	if err != nil {
		return a, false, err
	}
	return a, true, nil
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
		  WHERE status <> 'closed'
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
