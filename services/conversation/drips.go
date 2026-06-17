package main

import (
	"context"
	"time"

	"github.com/simpulx/v2/libs/go/events"
)

// dueDrip is one enrollment whose next step is due.
type dueDrip struct {
	ID          string
	OrgID       string
	ConvID      string
	Trigger     string
	StepBody    *string
	NextDelay   *int
	LastContact *time.Time
	UpdatedAt   time.Time
}

// dueEnrollments returns active enrollments whose next step is due, with the
// current step body and the next step's delay (if any).
func (s *store) dueEnrollments(ctx context.Context) ([]dueDrip, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT e.id::text, e.organization_id::text, e.conversation_id::text,
		        sq.trigger, cur.body, nxt.delay_minutes,
		        cv.last_contact_message_at, e.updated_at
		   FROM sequence_enrollments e
		   JOIN sequences sq ON sq.id = e.sequence_id AND sq.is_active
		   JOIN conversations cv ON cv.id = e.conversation_id
		   LEFT JOIN sequence_steps cur ON cur.sequence_id = e.sequence_id AND cur.step_order = e.current_step
		   LEFT JOIN sequence_steps nxt ON nxt.sequence_id = e.sequence_id AND nxt.step_order = e.current_step + 1
		  WHERE e.status = 'active' AND e.next_run_at <= now() AND cv.status <> 'closed'
		  ORDER BY e.next_run_at
		  LIMIT 200`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []dueDrip
	for rows.Next() {
		var d dueDrip
		if err := rows.Scan(&d.ID, &d.OrgID, &d.ConvID, &d.Trigger, &d.StepBody, &d.NextDelay, &d.LastContact, &d.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (s *store) advanceEnrollment(ctx context.Context, id string, nextDelayMin int) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE sequence_enrollments
		    SET current_step = current_step + 1,
		        next_run_at = now() + make_interval(mins => $2),
		        updated_at = now()
		  WHERE id = $1`, id, nextDelayMin)
	return err
}

func (s *store) setEnrollmentStatus(ctx context.Context, id, status string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE sequence_enrollments SET status = $2, updated_at = now() WHERE id = $1`, id, status)
	return err
}

// sendDueDrips sends every due follow-up step. For 'no_reply' sequences it
// stops the enrollment if the customer has replied since the last action.
func (a *app) sendDueDrips(ctx context.Context) {
	drips, err := a.st.dueEnrollments(ctx)
	if err != nil {
		a.log.Error("drip query failed", "err", err)
		return
	}
	sent := 0
	for _, d := range drips {
		replied := d.LastContact != nil && d.LastContact.After(d.UpdatedAt)
		if d.Trigger == "no_reply" && replied {
			_ = a.st.setEnrollmentStatus(ctx, d.ID, "stopped")
			continue
		}
		if d.StepBody == nil || *d.StepBody == "" {
			_ = a.st.setEnrollmentStatus(ctx, d.ID, "done")
			continue
		}
		if err := a.bus.Publish(events.SubjectMessageOutbound, d.OrgID, events.MessageOutbound{
			ConversationID: d.ConvID,
			SenderType:     "bot",
			Type:           "text",
			Body:           *d.StepBody,
		}); err != nil {
			a.log.Error("drip publish failed", "enrollment", d.ID, "err", err)
			continue
		}
		if d.NextDelay != nil {
			_ = a.st.advanceEnrollment(ctx, d.ID, *d.NextDelay)
		} else {
			_ = a.st.setEnrollmentStatus(ctx, d.ID, "done")
		}
		sent++
	}
	if sent > 0 {
		a.log.Info("drip steps sent", "count", sent)
	}
}
