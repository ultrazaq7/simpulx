package main

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/simpulx/v2/libs/go/config"
)

// ── WhatsApp message templates (HSM) ────────────────────────
// CRUD + submit-to-Meta. In dev/mock mode submit auto-approves;
// with real WABA credentials this is where the Graph API call goes.

// GET /api/templates
// Optional query filters:
//   ?channel_id=<uuid>   templates bound to that channel (plus channel-agnostic ones)
//   ?campaign_id=<uuid>  templates VISIBLE to that campaign:
//                          - explicitly linked to it, OR
//                          - unlinked (= all campaigns) and on a matching/any channel.
func (s *server) handleListTemplates(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	channelID := r.URL.Query().Get("channel_id")
	campaignID := r.URL.Query().Get("campaign_id")
	rows, err := s.queryMaps(r.Context(),
		`SELECT t.id::text AS id, t.name, t.category, t.language, t.header_type, t.header_text,
		        t.body, t.footer, t.buttons, t.variables, t.status, t.meta_template_id,
		        t.rejected_reason, t.channel_id::text AS channel_id,
		        COALESCE(array_agg(tc.campaign_id::text) FILTER (WHERE tc.campaign_id IS NOT NULL), '{}') AS campaign_ids,
		        t.created_at, t.updated_at
		   FROM message_templates t
		   LEFT JOIN template_campaigns tc ON tc.template_id = t.id
		  WHERE t.organization_id=$1
		    AND ($2 = '' OR t.channel_id = $2::uuid OR t.channel_id IS NULL)
		    AND ($3 = '' OR
		         EXISTS (SELECT 1 FROM template_campaigns x WHERE x.template_id = t.id AND x.campaign_id = $3::uuid)
		         OR (NOT EXISTS (SELECT 1 FROM template_campaigns x WHERE x.template_id = t.id)
		             AND (t.channel_id IS NULL OR t.channel_id = (SELECT channel_id FROM campaigns WHERE id = $3::uuid))))
		  GROUP BY t.id
		  ORDER BY t.updated_at DESC`,
		a.OrgID, channelID, campaignID,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

// setTemplateCampaigns replaces the campaign links for a template.
func (s *server) setTemplateCampaigns(ctx context.Context, templateID string, campaignIDs []string) error {
	if _, err := s.pool.Exec(ctx, `DELETE FROM template_campaigns WHERE template_id=$1`, templateID); err != nil {
		return err
	}
	for _, cid := range campaignIDs {
		if cid == "" {
			continue
		}
		if _, err := s.pool.Exec(ctx,
			`INSERT INTO template_campaigns (template_id, campaign_id) VALUES ($1,$2::uuid)
			 ON CONFLICT DO NOTHING`, templateID, cid); err != nil {
			return err
		}
	}
	return nil
}

type templateInput struct {
	Name        string          `json:"name"`
	Category    string          `json:"category"`
	Language    string          `json:"language"`
	HeaderType  string          `json:"header_type"`
	HeaderText  string          `json:"header_text"`
	Body        string          `json:"body"`
	Footer      string          `json:"footer"`
	Buttons     json.RawMessage `json:"buttons"`
	Variables   json.RawMessage `json:"variables"`
	ChannelID   string          `json:"channel_id"`
	// CampaignIDs scopes the template to specific campaigns. nil = leave as-is
	// (on update) / none (on create); [] = clear all links (visible to all).
	CampaignIDs *[]string `json:"campaign_ids"`
}

// POST /api/templates — saved as DRAFT until submitted.
func (s *server) handleCreateTemplate(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var b templateInput
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil || b.Name == "" || b.Body == "" {
		http.Error(w, "name & body required", http.StatusBadRequest)
		return
	}
	if b.Category == "" {
		b.Category = "MARKETING"
	}
	if b.Language == "" {
		b.Language = "en"
	}
	if b.HeaderType == "" {
		b.HeaderType = "NONE"
	}
	var id string
	err := s.pool.QueryRow(r.Context(),
		`INSERT INTO message_templates (organization_id, name, category, language, header_type,
		        header_text, body, footer, buttons, variables, channel_id, created_by, status)
		 VALUES ($1,$2,$3,$4,$5,NULLIF($6,''),$7,NULLIF($8,''),
		        COALESCE($9::jsonb,'[]'::jsonb), COALESCE($10::jsonb,'[]'::jsonb),
		        NULLIF($11,'')::uuid, $12, 'DRAFT')
		 RETURNING id::text`,
		a.OrgID, b.Name, b.Category, b.Language, b.HeaderType,
		b.HeaderText, b.Body, b.Footer, rawOrNil(b.Buttons), rawOrNil(b.Variables),
		b.ChannelID, a.UserID,
	).Scan(&id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if b.CampaignIDs != nil {
		if err := s.setTemplateCampaigns(r.Context(), id, *b.CampaignIDs); err != nil {
			s.log.Error("set template campaigns failed", "err", err)
		}
	}
	writeJSON(w, map[string]any{"id": id, "status": "DRAFT"})
}

// PATCH /api/templates/{id} — editing resets status to DRAFT.
func (s *server) handleUpdateTemplate(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var b templateInput
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	tag, err := s.pool.Exec(r.Context(),
		`UPDATE message_templates SET
		   name        = COALESCE(NULLIF($3,''), name),
		   category    = COALESCE(NULLIF($4,''), category),
		   language    = COALESCE(NULLIF($5,''), language),
		   header_type = COALESCE(NULLIF($6,''), header_type),
		   header_text = $7,
		   body        = COALESCE(NULLIF($8,''), body),
		   footer      = $9,
		   buttons     = COALESCE($10::jsonb, buttons),
		   variables   = COALESCE($11::jsonb, variables),
		   status      = 'DRAFT',
		   meta_template_id = NULL,
		   updated_at  = now()
		 WHERE id=$1 AND organization_id=$2`,
		r.PathValue("id"), a.OrgID, b.Name, b.Category, b.Language, b.HeaderType,
		b.HeaderText, b.Body, b.Footer, rawOrNil(b.Buttons), rawOrNil(b.Variables),
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if b.CampaignIDs != nil {
		if err := s.setTemplateCampaigns(r.Context(), r.PathValue("id"), *b.CampaignIDs); err != nil {
			s.log.Error("set template campaigns failed", "err", err)
		}
	}
	writeJSON(w, map[string]any{"status": "updated"})
}

// DELETE /api/templates/{id}
func (s *server) handleDeleteTemplate(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	tag, err := s.pool.Exec(r.Context(),
		`DELETE FROM message_templates WHERE id=$1 AND organization_id=$2`, r.PathValue("id"), a.OrgID)
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

// POST /api/templates/{id}/submit — submit to Meta for approval.
// Real WABA: POST to Graph API /{waba_id}/message_templates -> PENDING,
// then a webhook updates status. In dev/mock mode we auto-approve.
func (s *server) handleSubmitTemplate(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	mock := config.GetBool("WA_MOCK", true)
	newStatus := "PENDING"
	var metaID any
	if mock {
		newStatus = "APPROVED"
		metaID = "mock-" + r.PathValue("id")
	}
	tag, err := s.pool.Exec(r.Context(),
		`UPDATE message_templates
		    SET status=$3, meta_template_id=COALESCE($4, meta_template_id), rejected_reason=NULL, updated_at=now()
		  WHERE id=$1 AND organization_id=$2`,
		r.PathValue("id"), a.OrgID, newStatus, metaID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	s.audit(r.Context(), a, "submitted", "template", r.PathValue("id"), map[string]any{"status": newStatus})
	writeJSON(w, map[string]any{"status": newStatus, "simulated": mock})
}
