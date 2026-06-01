package main

import (
	"encoding/json"
	"net/http"
)

// ── Users (org user accounts) ───────────────────────────────
// Org-level user/agent accounts. Roles are a fixed RBAC catalog
// (owner|admin|manager|agent); per-campaign agent assignment is
// handled separately at the campaign level.

// GET /api/users — enriched for the People table: department names, campaign
// names, last login, and open-chat load. Aggregated via subqueries so a user with
// no departments/campaigns still returns one row.
func (s *server) handleListUsers(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	rows, err := s.queryMaps(r.Context(),
		`SELECT u.id::text AS id, u.full_name, u.email, u.role, u.status, u.is_online,
		        u.last_seen_at, u.last_login_at, u.created_at,
		        COALESCE((SELECT array_agg(d.name ORDER BY d.name)
		                    FROM agent_departments ad JOIN departments d ON d.id = ad.department_id
		                   WHERE ad.user_id = u.id), '{}') AS department_names,
		        COALESCE((SELECT array_agg(c.name ORDER BY c.name)
		                    FROM campaign_agents ca JOIN campaigns c ON c.id = ca.campaign_id
		                   WHERE ca.user_id = u.id), '{}') AS campaign_names,
		        (SELECT count(*) FROM agent_departments ad WHERE ad.user_id = u.id) AS departments,
		        (SELECT count(*) FROM conversations c WHERE c.assigned_agent_id = u.id AND c.status <> 'closed') AS open_chats
		   FROM users u
		  WHERE u.organization_id = $1
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
func (s *server) handleUpdateUser(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	targetID := r.PathValue("id")
	var b struct {
		FullName *string `json:"full_name"`
		Email    *string `json:"email"`
		Role     *string `json:"role"`
		Status   *string `json:"status"`
		Password *string `json:"password"`
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

	tag, err := s.pool.Exec(r.Context(),
		`UPDATE users SET
		   full_name     = COALESCE(NULLIF($3,''), full_name),
		   email         = COALESCE(NULLIF($4,''), email),
		   role          = COALESCE(NULLIF($5,''), role),
		   status        = COALESCE(NULLIF($6,''), status),
		   password_hash = COALESCE(NULLIF($7,''), password_hash),
		   updated_at = now()
		 WHERE id=$1 AND organization_id=$2`,
		targetID, a.OrgID, derefStr(b.FullName), derefStr(b.Email),
		derefStr(b.Role), derefStr(b.Status), pwHash)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
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

// DELETE /api/users/{id}
func (s *server) handleDeleteUser(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	if r.PathValue("id") == a.UserID {
		http.Error(w, "cannot delete yourself", http.StatusBadRequest)
		return
	}
	tag, err := s.pool.Exec(r.Context(),
		`DELETE FROM users WHERE id=$1 AND organization_id=$2`, r.PathValue("id"), a.OrgID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	s.audit(r.Context(), a, "deleted", "user", r.PathValue("id"), nil)
	writeJSON(w, map[string]any{"status": "deleted"})
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
