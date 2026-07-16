package main

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/simpulx/v2/libs/go/events"
)

// publishStagesUpdated tells every client the org's pipeline stage config changed
// (add/rename/reorder/delete) so they refetch the stage list — cached stage
// names/orders stay correct without an app reload.
func (s *server) publishStagesUpdated(ctx context.Context, orgID string) {
	if err := s.bus.Publish(events.SubjectStagesUpdated, orgID, events.StagesUpdated{OrgID: orgID}); err != nil {
		s.log.Warn("publish stages.updated failed", "err", err)
	}
}

// Pipeline stage management (Settings > Pipeline Stages). Owner/admin only.
// System stages (system_key set) can be renamed and reordered but not deleted —
// the classifier/orchestrator map to them by system_key. Custom stages (no
// system_key) are fully editable. Localization: the UI shows t("stages.<key>")
// for a pristine system stage and the stored name once it's been renamed.

func ownerOrAdmin(w http.ResponseWriter, a authInfo) bool {
	if a.Role != "owner" && a.Role != "admin" {
		http.Error(w, "only an owner or admin can manage pipeline stages", http.StatusForbidden)
		return false
	}
	return true
}

// POST /api/stages {name, sort_order?} — create a custom stage.
func (s *server) handleCreateStage(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	if !ownerOrAdmin(w, a) {
		return
	}
	var b struct {
		Name      string `json:"name"`
		SortOrder *int   `json:"sort_order"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	name := strings.TrimSpace(b.Name)
	if name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	// Default to the end of the pipeline (above the lost stages, which sit at 0).
	sortOrder := 0
	if b.SortOrder != nil {
		sortOrder = *b.SortOrder
	} else {
		_ = s.pool.QueryRow(r.Context(),
			`SELECT COALESCE(max(sort_order),0)+1 FROM stages WHERE organization_id=$1`, a.OrgID).Scan(&sortOrder)
	}
	var id string
	err := s.pool.QueryRow(r.Context(),
		`INSERT INTO stages (organization_id, name, sort_order) VALUES ($1,$2,$3) RETURNING id::text`,
		a.OrgID, name, sortOrder).Scan(&id)
	if err != nil {
		if strings.Contains(err.Error(), "stages_organization_id_name_key") {
			http.Error(w, "a stage with that name already exists", http.StatusConflict)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.audit(r.Context(), a, "created", "stage", id, map[string]any{"name": name})
	s.publishStagesUpdated(r.Context(), a.OrgID)
	writeJSON(w, map[string]any{"id": id})
}

// PATCH /api/stages/{id} {name?, sort_order?} — rename / reorder any stage.
func (s *server) handleUpdateStage(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	if !ownerOrAdmin(w, a) {
		return
	}
	var b struct {
		Name      *string `json:"name"`
		SortOrder *int    `json:"sort_order"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	name := ""
	if b.Name != nil {
		name = strings.TrimSpace(*b.Name)
	}
	tag, err := s.pool.Exec(r.Context(),
		`UPDATE stages SET
		   name = COALESCE(NULLIF($3,''), name),
		   sort_order = COALESCE($4, sort_order)
		 WHERE id=$1 AND organization_id=$2`,
		r.PathValue("id"), a.OrgID, name, b.SortOrder)
	if err != nil {
		if strings.Contains(err.Error(), "stages_organization_id_name_key") {
			http.Error(w, "a stage with that name already exists", http.StatusConflict)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	s.publishStagesUpdated(r.Context(), a.OrgID)
	writeJSON(w, map[string]any{"status": "updated"})
}

// DELETE /api/stages/{id} — remove a custom stage. System stages are protected.
// Conversations/contacts at this stage fall back to no stage (FK ON DELETE SET NULL).
func (s *server) handleDeleteStage(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	if !ownerOrAdmin(w, a) {
		return
	}
	id := r.PathValue("id")
	var systemKey *string
	if err := s.pool.QueryRow(r.Context(),
		`SELECT system_key FROM stages WHERE id=$1 AND organization_id=$2`, id, a.OrgID).Scan(&systemKey); err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if systemKey != nil && *systemKey != "" {
		http.Error(w, "a default pipeline stage can't be deleted (you can rename it)", http.StatusBadRequest)
		return
	}
	if _, err := s.pool.Exec(r.Context(),
		`DELETE FROM stages WHERE id=$1 AND organization_id=$2 AND system_key IS NULL`, id, a.OrgID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.audit(r.Context(), a, "deleted", "stage", id, nil)
	s.publishStagesUpdated(r.Context(), a.OrgID)
	writeJSON(w, map[string]any{"status": "deleted"})
}

// POST /api/stages/reorder {ids:[...]} — set sort_order by position (1..N) for the
// listed pipeline stages. Lost stages (sort_order 0) are left out by the client.
func (s *server) handleReorderStages(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	if !ownerOrAdmin(w, a) {
		return
	}
	var b struct {
		IDs []string `json:"ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	tx, err := s.pool.Begin(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())
	for i, id := range b.IDs {
		if _, err := tx.Exec(r.Context(),
			`UPDATE stages SET sort_order=$3 WHERE id=$1 AND organization_id=$2`, id, a.OrgID, i+1); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.publishStagesUpdated(r.Context(), a.OrgID)
	writeJSON(w, map[string]any{"status": "reordered"})
}
