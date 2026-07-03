package main

import (
	"context"
	"encoding/json"
	"net/http"
)

// Lead fields (stage / interest / owner) live on a conversation when one
// exists, else on the contact as a fallback (see migration 0078). applyContactLead
// routes a change to the right place and logs stage/interest changes to the
// conversation timeline, mirroring handlePatchConversation. Returns whether any
// row was touched.
func (s *server) applyContactLead(ctx context.Context, orgID, actorID string, contactID string,
	stageID, interest, agentID *string, canAssign bool) (bool, error) {

	setStage := stageID != nil && *stageID != ""
	setInterest := interest != nil && *interest != ""
	setAgent := agentID != nil && canAssign // empty agentID == unassign
	if !setStage && !setInterest && !setAgent {
		return false, nil
	}

	// Most-recent conversation for this contact, if any.
	var convID string
	_ = s.pool.QueryRow(ctx,
		`SELECT id::text FROM conversations WHERE contact_id=$1 AND organization_id=$2
		   ORDER BY last_message_at DESC NULLS LAST LIMIT 1`, contactID, orgID).Scan(&convID)
	hasConv := convID != ""

	touched := false
	if hasConv {
		if setStage || setInterest {
			if _, err := s.pool.Exec(ctx,
				`UPDATE conversations SET
				   stage_id = COALESCE(NULLIF($3,'')::uuid, stage_id),
				   interest_level = COALESCE(NULLIF($4,''), interest_level),
				   classification_locked = true, updated_at = now()
				 WHERE id=$1 AND organization_id=$2`,
				convID, orgID, derefStr(stageID), derefStr(interest)); err != nil {
				return touched, err
			}
			touched = true
			logEvt := func(typ string, detail map[string]any) {
				d, _ := json.Marshal(detail)
				_, _ = s.pool.Exec(ctx,
					`INSERT INTO conversation_events (organization_id, conversation_id, type, actor_type, actor_id, detail)
					 VALUES ($1, $2, $3, 'agent', $4::uuid, $5::jsonb)`,
					orgID, convID, typ, actorID, string(d))
			}
			if setStage {
				var stageName string
				_ = s.pool.QueryRow(ctx, `SELECT COALESCE(name,'') FROM stages WHERE id=$1`, *stageID).Scan(&stageName)
				logEvt("stage_changed", map[string]any{"stage_id": *stageID, "stage_name": stageName})
			}
			if setInterest {
				logEvt("interest_changed", map[string]any{"interest_level": *interest})
			}
		}
		if setAgent {
			if _, err := s.pool.Exec(ctx,
				`UPDATE conversations SET assigned_agent_id = NULLIF($3,'')::uuid, updated_at = now()
				 WHERE id=$1 AND organization_id=$2`, convID, orgID, derefStr(agentID)); err != nil {
				return touched, err
			}
			touched = true
		}
		return touched, nil
	}

	// No conversation: write the contact-level fallback columns.
	if setStage {
		if _, err := s.pool.Exec(ctx,
			`UPDATE contacts SET stage_id = NULLIF($3,'')::uuid, updated_at = now()
			 WHERE id=$1 AND organization_id=$2`, contactID, orgID, derefStr(stageID)); err != nil {
			return touched, err
		}
		touched = true
	}
	if setInterest {
		if _, err := s.pool.Exec(ctx,
			`UPDATE contacts SET interest_level = NULLIF($3,''), updated_at = now()
			 WHERE id=$1 AND organization_id=$2`, contactID, orgID, derefStr(interest)); err != nil {
			return touched, err
		}
		touched = true
	}
	if setAgent {
		if _, err := s.pool.Exec(ctx,
			`UPDATE contacts SET assigned_agent_id = NULLIF($3,'')::uuid, updated_at = now()
			 WHERE id=$1 AND organization_id=$2`, contactID, orgID, derefStr(agentID)); err != nil {
			return touched, err
		}
		touched = true
	}
	return touched, nil
}

// ── POST /api/contacts/bulk-update ──────────────────────────────────────────
// Applies a stage / interest / owner / tags / blacklist change to many contacts
// at once. Stage/interest/owner route through applyContactLead (conversation if
// present, else contact). Assigning an owner requires owner/admin/manager, same
// as the single-conversation assign path.
func (s *server) handleBulkUpdateContacts(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var body struct {
		ContactIDs []string `json:"contact_ids"`
		Set        struct {
			StageID       *string  `json:"stage_id"`
			InterestLevel *string  `json:"interest_level"`
			AssignedAgent *string  `json:"assigned_agent_id"`
			AddTags       []string `json:"add_tags"`
			RemoveTags    []string `json:"remove_tags"`
			Blacklisted   *bool    `json:"blacklisted"`
		} `json:"set"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if len(body.ContactIDs) == 0 {
		http.Error(w, "no contacts", http.StatusBadRequest)
		return
	}

	canAssign := a.Role == "owner" || a.Role == "admin" || a.Role == "manager"
	type skip struct {
		ContactID string `json:"contact_id"`
		Reason    string `json:"reason"`
	}
	skipped := []skip{}
	updated := 0

	for _, id := range body.ContactIDs {
		// Tenant ownership check per id (IDOR guard).
		var exists bool
		_ = s.pool.QueryRow(r.Context(),
			`SELECT true FROM contacts WHERE id=$1 AND organization_id=$2`, id, a.OrgID).Scan(&exists)
		if !exists {
			skipped = append(skipped, skip{id, "not found"})
			continue
		}
		if body.Set.AssignedAgent != nil && !canAssign {
			skipped = append(skipped, skip{id, "not allowed to assign"})
			continue
		}

		if _, err := s.applyContactLead(r.Context(), a.OrgID, a.UserID, id,
			body.Set.StageID, body.Set.InterestLevel, body.Set.AssignedAgent, canAssign); err != nil {
			skipped = append(skipped, skip{id, err.Error()})
			continue
		}

		// Tags + blacklist always live on the contact row.
		if len(body.Set.AddTags) > 0 {
			_, _ = s.pool.Exec(r.Context(),
				`UPDATE contacts SET tags = (
				   SELECT array(SELECT DISTINCT unnest(COALESCE(tags,'{}') || $3::text[])))
				 WHERE id=$1 AND organization_id=$2`, id, a.OrgID, body.Set.AddTags)
		}
		if len(body.Set.RemoveTags) > 0 {
			_, _ = s.pool.Exec(r.Context(),
				`UPDATE contacts SET tags = array(
				   SELECT t FROM unnest(COALESCE(tags,'{}')) t WHERE t <> ALL($3::text[]))
				 WHERE id=$1 AND organization_id=$2`, id, a.OrgID, body.Set.RemoveTags)
		}
		if body.Set.Blacklisted != nil {
			_, _ = s.pool.Exec(r.Context(),
				`UPDATE contacts SET blacklisted=$3, updated_at=now() WHERE id=$1 AND organization_id=$2`,
				id, a.OrgID, *body.Set.Blacklisted)
		}
		updated++
	}

	writeJSON(w, map[string]any{"updated": updated, "skipped": skipped})
}
