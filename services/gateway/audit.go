package main

import (
	"context"
	"encoding/json"
	"net/http"
)

// audit records a workspace action. Best-effort: a failed audit write
// must never break the underlying operation, so errors are only logged.
func (s *server) audit(ctx context.Context, a authInfo, action, entityType, entityID string, detail map[string]any) {
	d, err := json.Marshal(detail)
	if err != nil || d == nil {
		d = []byte("{}")
	}
	if _, err := s.pool.Exec(ctx,
		`INSERT INTO audit_log (organization_id, actor_id, actor_name, action, entity_type, entity_id, detail)
		 VALUES ($1, NULLIF($2,'')::uuid, $3, $4, $5, NULLIF($6,''), $7::jsonb)`,
		a.OrgID, a.UserID, a.Name, action, entityType, entityID, string(d),
	); err != nil {
		s.log.Warn("audit write failed", "action", action, "err", err)
	}
}

// GET /api/audit-log
func (s *server) handleListAuditLog(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	rows, err := s.queryMaps(r.Context(),
		`SELECT id::text AS id, actor_name, action, entity_type, entity_id, detail, created_at
		   FROM audit_log
		  WHERE organization_id = $1
		  ORDER BY created_at DESC
		  LIMIT 200`,
		a.OrgID,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}
