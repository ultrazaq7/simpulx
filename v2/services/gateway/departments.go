package main

import (
	"encoding/json"
	"net/http"
)

// ── Departments ─────────────────────────────────────────────
// Org-level grouping. Agent assignment / routing happens at the
// campaign level, so org settings only manages departments here.

// GET /api/departments
func (s *server) handleListDepartments(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	rows, err := s.queryMaps(r.Context(),
		`SELECT d.id::text AS id, d.name,
		        (SELECT count(*) FROM agent_departments ad WHERE ad.department_id = d.id) AS members
		   FROM departments d
		  WHERE d.organization_id = $1
		  ORDER BY d.name`,
		a.OrgID,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

// POST /api/departments {name}
func (s *server) handleCreateDepartment(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var b struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil || b.Name == "" {
		http.Error(w, "name required", http.StatusBadRequest)
		return
	}
	var id string
	err := s.pool.QueryRow(r.Context(),
		`INSERT INTO departments (organization_id, name) VALUES ($1,$2) RETURNING id::text`,
		a.OrgID, b.Name).Scan(&id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"id": id})
}

// PATCH /api/departments/{id} {name}
func (s *server) handleUpdateDepartment(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var b struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil || b.Name == "" {
		http.Error(w, "name required", http.StatusBadRequest)
		return
	}
	tag, err := s.pool.Exec(r.Context(),
		`UPDATE departments SET name=$3 WHERE id=$1 AND organization_id=$2`,
		r.PathValue("id"), a.OrgID, b.Name)
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

// DELETE /api/departments/{id}
func (s *server) handleDeleteDepartment(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	tag, err := s.pool.Exec(r.Context(),
		`DELETE FROM departments WHERE id=$1 AND organization_id=$2`, r.PathValue("id"), a.OrgID)
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
