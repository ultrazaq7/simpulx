package main

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

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
		        t.template_type, t.components, t.header_media_url,
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
	HeaderMediaURL string       `json:"header_media_url"`
	Body        string          `json:"body"`
	Footer      string          `json:"footer"`
	Buttons     json.RawMessage `json:"buttons"`
	Variables   json.RawMessage `json:"variables"`
	ChannelID   string          `json:"channel_id"`
	// TemplateType: standard | carousel | call_permission | request_contact.
	TemplateType string          `json:"template_type"`
	// Components: structured extras (e.g. carousel cards) that don't fit the flat columns.
	Components   json.RawMessage `json:"components"`
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
	if b.TemplateType == "" {
		b.TemplateType = "standard"
	}
	var id string
	err := s.pool.QueryRow(r.Context(),
		`INSERT INTO message_templates (organization_id, name, category, language, header_type,
		        header_text, body, footer, buttons, variables, channel_id, created_by, status,
		        template_type, components, header_media_url)
		 VALUES ($1,$2,$3,$4,$5,NULLIF($6,''),$7,NULLIF($8,''),
		        COALESCE($9::jsonb,'[]'::jsonb), COALESCE($10::jsonb,'[]'::jsonb),
		        NULLIF($11,'')::uuid, $12, 'DRAFT',
		        $13, COALESCE($14::jsonb,'{}'::jsonb), NULLIF($15,''))
		 RETURNING id::text`,
		a.OrgID, b.Name, b.Category, b.Language, b.HeaderType,
		b.HeaderText, b.Body, b.Footer, rawOrNil(b.Buttons), rawOrNil(b.Variables),
		b.ChannelID, a.UserID,
		b.TemplateType, rawOrNil(b.Components), b.HeaderMediaURL,
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
		   template_type = COALESCE(NULLIF($12,''), template_type),
		   components  = COALESCE($13::jsonb, components),
		   header_media_url = $14,
		   status      = 'DRAFT',
		   meta_template_id = NULL,
		   updated_at  = now()
		 WHERE id=$1 AND organization_id=$2`,
		r.PathValue("id"), a.OrgID, b.Name, b.Category, b.Language, b.HeaderType,
		b.HeaderText, b.Body, b.Footer, rawOrNil(b.Buttons), rawOrNil(b.Variables),
		b.TemplateType, rawOrNil(b.Components), b.HeaderMediaURL,
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
// If the template was registered on Meta (has a real meta_template_id), delete it
// there first (best-effort) so Simpulx and Meta stay in sync. The local row is
// removed regardless; a warning is returned if the Meta delete failed.
func (s *server) handleDeleteTemplate(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	id := r.PathValue("id")

	var metaID, name, channelID string
	err := s.pool.QueryRow(r.Context(),
		`SELECT COALESCE(meta_template_id,''), name, COALESCE(channel_id::text,'')
		   FROM message_templates WHERE id=$1 AND organization_id=$2`,
		id, a.OrgID).Scan(&metaID, &name, &channelID)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	warning := ""
	if !config.GetBool("WA_MOCK", true) && metaID != "" && !strings.HasPrefix(metaID, "mock-") {
		if waba, token, werr := s.templateWABA(r.Context(), a.OrgID, channelID); werr == nil {
			if derr := s.deleteTemplateFromMeta(r.Context(), waba, token, name); derr != nil {
				warning = "Removed from Simpulx, but Meta delete failed (delete it in WhatsApp Manager): " + derr.Error()
				s.log.Warn("meta template delete failed", "name", name, "err", derr)
			}
		} else {
			warning = "Removed from Simpulx, but no WABA channel to delete it from Meta."
		}
	}

	tag, err := s.pool.Exec(r.Context(),
		`DELETE FROM message_templates WHERE id=$1 AND organization_id=$2`, id, a.OrgID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	resp := map[string]any{"status": "deleted"}
	if warning != "" {
		resp["warning"] = warning
	}
	writeJSON(w, resp)
}

// POST /api/templates/{id}/submit — submit to Meta for approval.
// Real WABA: POST to Graph API /{waba_id}/message_templates -> PENDING, then the
// message_template_status_update webhook flips APPROVED/REJECTED. In mock mode we
// auto-approve.
func (s *server) handleSubmitTemplate(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	id := r.PathValue("id")
	mock := config.GetBool("WA_MOCK", true)

	var newStatus string
	var metaID any
	if mock {
		newStatus = "APPROVED"
		metaID = "mock-" + id
	} else {
		st, mid, err := s.submitTemplateToMeta(r.Context(), a.OrgID, id)
		if err != nil {
			// 422 (not 502) so Cloudflare passes the real Meta error through to
			// the UI instead of masking it with a branded 502 page.
			s.log.Error("submit template to meta failed", "template", id, "err", err)
			http.Error(w, err.Error(), http.StatusUnprocessableEntity)
			return
		}
		newStatus = st
		metaID = mid
	}

	tag, err := s.pool.Exec(r.Context(),
		`UPDATE message_templates
		    SET status=$3, meta_template_id=COALESCE($4, meta_template_id), rejected_reason=NULL, updated_at=now()
		  WHERE id=$1 AND organization_id=$2`,
		id, a.OrgID, newStatus, metaID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	s.audit(r.Context(), a, "submitted", "template", id, map[string]any{"status": newStatus})
	writeJSON(w, map[string]any{"status": newStatus, "simulated": mock})
}
