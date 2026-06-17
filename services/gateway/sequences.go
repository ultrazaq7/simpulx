package main

import (
	"context"
	"encoding/json"
	"net/http"
)

// ── Sequences (drip / follow-up) ────────────────────────────
// Management only; enrollment happens in messaging on new threads and
// due steps are sent by the conversation service worker.

// GET /api/sequences
func (s *server) handleListSequences(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	rows, err := s.queryMaps(r.Context(),
		`SELECT sq.id::text AS id, sq.name, sq.trigger, sq.is_active,
		        sq.campaign_id::text AS campaign_id, c.name AS campaign_name,
		        (SELECT count(*) FROM sequence_steps st WHERE st.sequence_id = sq.id) AS steps,
		        (SELECT count(*) FROM sequence_enrollments e WHERE e.sequence_id = sq.id AND e.status='active') AS active_enrollments,
		        sq.created_at, sq.updated_at
		   FROM sequences sq
		   LEFT JOIN campaigns c ON c.id = sq.campaign_id
		  WHERE sq.organization_id = $1
		  ORDER BY sq.updated_at DESC`,
		a.OrgID,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

// GET /api/sequences/{id} — includes ordered steps.
func (s *server) handleGetSequence(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	rows, err := s.queryMaps(r.Context(),
		`SELECT id::text AS id, name, trigger, is_active, campaign_id::text AS campaign_id,
		        COALESCE((SELECT jsonb_agg(jsonb_build_object('delay_minutes', st.delay_minutes, 'body', st.body) ORDER BY st.step_order)
		                  FROM sequence_steps st WHERE st.sequence_id = sequences.id), '[]'::jsonb) AS steps
		   FROM sequences WHERE id=$1 AND organization_id=$2`,
		r.PathValue("id"), a.OrgID,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if len(rows) == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	writeJSON(w, rows[0])
}

type sequenceStepInput struct {
	DelayMinutes int    `json:"delay_minutes"`
	Body         string `json:"body"`
}
type sequenceInput struct {
	Name       string              `json:"name"`
	Trigger    string              `json:"trigger"`
	CampaignID string              `json:"campaign_id"`
	IsActive   *bool               `json:"is_active"`
	Steps      []sequenceStepInput `json:"steps"`
}

// POST /api/sequences
func (s *server) handleCreateSequence(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var b sequenceInput
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil || b.Name == "" {
		http.Error(w, "name required", http.StatusBadRequest)
		return
	}
	if b.Trigger == "" {
		b.Trigger = "no_reply"
	}
	var id string
	err := s.pool.QueryRow(r.Context(),
		`INSERT INTO sequences (organization_id, name, trigger, campaign_id)
		 VALUES ($1,$2,$3,NULLIF($4,'')::uuid) RETURNING id::text`,
		a.OrgID, b.Name, b.Trigger, b.CampaignID,
	).Scan(&id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if err := s.syncSequenceSteps(r.Context(), id, b.Steps); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.audit(r.Context(), a, "created", "sequence", id, map[string]any{"name": b.Name})
	writeJSON(w, map[string]any{"id": id})
}

// PATCH /api/sequences/{id}
func (s *server) handleUpdateSequence(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var b sequenceInput
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	tag, err := s.pool.Exec(r.Context(),
		`UPDATE sequences SET
		   name = COALESCE(NULLIF($3,''), name),
		   trigger = COALESCE(NULLIF($4,''), trigger),
		   campaign_id = CASE WHEN $5 = '' THEN campaign_id ELSE NULLIF($5,'__null__')::uuid END,
		   is_active = COALESCE($6, is_active),
		   updated_at = now()
		 WHERE id=$1 AND organization_id=$2`,
		r.PathValue("id"), a.OrgID, b.Name, b.Trigger, b.CampaignID, b.IsActive)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if b.Steps != nil {
		if err := s.syncSequenceSteps(r.Context(), r.PathValue("id"), b.Steps); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}
	writeJSON(w, map[string]any{"status": "updated"})
}

// DELETE /api/sequences/{id}
func (s *server) handleDeleteSequence(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	tag, err := s.pool.Exec(r.Context(),
		`DELETE FROM sequences WHERE id=$1 AND organization_id=$2`, r.PathValue("id"), a.OrgID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	writeJSON(w, map[string]any{"status": "deleted"})
}

func (s *server) syncSequenceSteps(ctx context.Context, sequenceID string, steps []sequenceStepInput) error {
	if _, err := s.pool.Exec(ctx, `DELETE FROM sequence_steps WHERE sequence_id=$1`, sequenceID); err != nil {
		return err
	}
	for i, st := range steps {
		if st.Body == "" {
			continue
		}
		delay := st.DelayMinutes
		if delay <= 0 {
			delay = 60
		}
		if _, err := s.pool.Exec(ctx,
			`INSERT INTO sequence_steps (sequence_id, step_order, delay_minutes, body) VALUES ($1,$2,$3,$4)`,
			sequenceID, i+1, delay, st.Body); err != nil {
			return err
		}
	}
	return nil
}
