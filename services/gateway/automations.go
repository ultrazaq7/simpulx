package main

import (
	"encoding/json"
	"net/http"
)

// ── Automations (trigger -> actions / flow) ─────────────────
// Backs the Automation page (rule grid) and the Flow builder.

// GET /api/automations
func (s *server) handleListAutomations(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	rows, err := s.queryMaps(r.Context(),
		`SELECT au.id::text AS id, au.name, au.description, au.trigger_type,
		        au.trigger_config, au.channel_id::text AS channel_id, c.name AS channel_name,
		        au.actions, au.is_active, au.run_count, au.created_at, au.updated_at
		   FROM automations au
		   LEFT JOIN channels c ON c.id = au.channel_id
		  WHERE au.organization_id = $1
		  ORDER BY au.updated_at DESC`,
		a.OrgID,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

// GET /api/automations/{id} — includes the flow graph for the builder.
func (s *server) handleGetAutomation(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	rows, err := s.queryMaps(r.Context(),
		`SELECT id::text AS id, name, description, trigger_type, trigger_config,
		        channel_id::text AS channel_id, actions, flow, is_active, run_count
		   FROM automations WHERE id=$1 AND organization_id=$2`,
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

type automationInput struct {
	Name          string          `json:"name"`
	Description   string          `json:"description"`
	TriggerType   string          `json:"trigger_type"`
	TriggerConfig json.RawMessage `json:"trigger_config"`
	ChannelID     string          `json:"channel_id"`
	Actions       json.RawMessage `json:"actions"`
	Flow          json.RawMessage `json:"flow"`
	IsActive      *bool           `json:"is_active"`
}

// POST /api/automations/{id}/clone — duplicate an automation (trigger + actions +
// visual flow) into a new one in the same org. Org-scoped. The clone starts
// INACTIVE (is_active=false) so it never fires until reviewed and toggled on.
func (s *server) handleCloneAutomation(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	src := r.PathValue("id")
	var newID string
	err := s.pool.QueryRow(r.Context(),
		`INSERT INTO automations
		   (organization_id, name, description, trigger_type, trigger_config, channel_id, actions, flow, is_active, created_by)
		 SELECT organization_id, left(name || ' (copy)', 160), description, trigger_type, trigger_config, channel_id, actions, flow, false, $3
		   FROM automations WHERE id=$1 AND organization_id=$2
		 RETURNING id::text`, src, a.OrgID, a.UserID).Scan(&newID)
	if err != nil {
		http.Error(w, "clone failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	s.audit(r.Context(), a, "cloned", "automation", newID, map[string]any{"source": src})
	writeJSON(w, map[string]any{"id": newID})
}

// POST /api/automations
func (s *server) handleCreateAutomation(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var b automationInput
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil || b.Name == "" {
		http.Error(w, "name required", http.StatusBadRequest)
		return
	}
	if b.TriggerType == "" {
		b.TriggerType = "new_message"
	}
	var id string
	err := s.pool.QueryRow(r.Context(),
		`INSERT INTO automations (organization_id, name, description, trigger_type,
		        trigger_config, channel_id, actions, created_by)
		 VALUES ($1,$2,$3,$4,
		        COALESCE($5::jsonb,'{}'::jsonb),
		        NULLIF($6,'')::uuid,
		        COALESCE($7::jsonb,'[]'::jsonb),
		        $8)
		 RETURNING id::text`,
		a.OrgID, b.Name, b.Description, b.TriggerType,
		rawOrNil(b.TriggerConfig), b.ChannelID, rawOrNil(b.Actions), a.UserID,
	).Scan(&id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.audit(r.Context(), a, "created", "automation", id, map[string]any{"name": b.Name, "trigger": b.TriggerType})
	writeJSON(w, map[string]any{"id": id})
}

// PATCH /api/automations/{id} — partial update incl. flow graph & toggle.
func (s *server) handleUpdateAutomation(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var b automationInput
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	tag, err := s.pool.Exec(r.Context(),
		`UPDATE automations SET
		   name           = COALESCE(NULLIF($3,''), name),
		   description    = COALESCE(NULLIF($4,''), description),
		   trigger_type   = COALESCE(NULLIF($5,''), trigger_type),
		   trigger_config = COALESCE($6::jsonb, trigger_config),
		   channel_id     = COALESCE(NULLIF($7,'')::uuid, channel_id),
		   actions        = COALESCE($8::jsonb, actions),
		   flow           = COALESCE($9::jsonb, flow),
		   is_active      = COALESCE($10, is_active),
		   updated_at     = now()
		 WHERE id=$1 AND organization_id=$2`,
		r.PathValue("id"), a.OrgID, b.Name, b.Description, b.TriggerType,
		rawOrNil(b.TriggerConfig), b.ChannelID, rawOrNil(b.Actions), rawOrNil(b.Flow), b.IsActive,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	writeJSON(w, map[string]any{"status": "updated"})
}

// DELETE /api/automations/{id}
func (s *server) handleDeleteAutomation(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	tag, err := s.pool.Exec(r.Context(),
		`DELETE FROM automations WHERE id=$1 AND organization_id=$2`, r.PathValue("id"), a.OrgID)
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

// rawOrNil returns nil for empty/invalid JSON so COALESCE keeps the old value.
func rawOrNil(m json.RawMessage) any {
	if len(m) == 0 || string(m) == "null" {
		return nil
	}
	return string(m)
}
