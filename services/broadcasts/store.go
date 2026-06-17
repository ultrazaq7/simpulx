package main

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type store struct{ pool *pgxpool.Pool }

type broadcast struct {
	ID        string
	OrgID     string
	ChannelID *string
	Body      string
	Status    string
}

func (s *store) getBroadcast(ctx context.Context, id string) (broadcast, error) {
	var b broadcast
	err := s.pool.QueryRow(ctx,
		`SELECT id::text, organization_id::text, channel_id::text, body, status
		   FROM broadcasts WHERE id = $1`, id,
	).Scan(&b.ID, &b.OrgID, &b.ChannelID, &b.Body, &b.Status)
	return b, err
}

type recipient struct {
	ID        string
	ContactID string
}

func (s *store) pendingRecipients(ctx context.Context, broadcastID string) ([]recipient, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id::text, contact_id::text FROM broadcast_recipients
		  WHERE broadcast_id = $1 AND status = 'pending' ORDER BY created_at`, broadcastID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []recipient
	for rows.Next() {
		var r recipient
		if err := rows.Scan(&r.ID, &r.ContactID); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *store) markSending(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE broadcasts SET status='sending', started_at=COALESCE(started_at, now()) WHERE id=$1`, id)
	return err
}

// claimRecipient atomically transitions a recipient pending->sent and reports
// whether THIS call won the claim. Idempotent: a redelivered or concurrent
// broadcast event can never send the same recipient twice.
func (s *store) claimRecipient(ctx context.Context, recipID string) (bool, error) {
	ct, err := s.pool.Exec(ctx,
		`UPDATE broadcast_recipients SET status='sent', sent_at=now()
		   WHERE id=$1 AND status='pending'`, recipID)
	if err != nil {
		return false, err
	}
	return ct.RowsAffected() == 1, nil
}

func (s *store) bumpSent(ctx context.Context, broadcastID string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE broadcasts SET sent_count = sent_count + 1 WHERE id=$1`, broadcastID)
	return err
}

func (s *store) complete(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE broadcasts SET status='completed', completed_at=now() WHERE id=$1`, id)
	return err
}
