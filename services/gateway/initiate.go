package main

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/simpulx/v2/libs/go/events"
)

// ── POST /api/contacts/send-template ────────────────────────────────────────
// Initiate (or re-open) a WhatsApp conversation with one or more contacts by
// sending a real approved HSM template with per-send variable values. For each
// contact, messaging get-or-creates a conversation and sends the template.
func (s *server) handleSendTemplateToContacts(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var body struct {
		ContactIDs []string `json:"contact_ids"`
		ChannelID  string   `json:"channel_id"`
		TemplateID string   `json:"template_id"`
		Variables  []string `json:"variables"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if len(body.ContactIDs) == 0 || body.TemplateID == "" {
		http.Error(w, "contact_ids and template_id are required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()

	// Load the template; it must belong to the org and be Meta-approved.
	var name, lang, bodyText, headerType, status string
	var vars []string
	err := s.pool.QueryRow(ctx,
		`SELECT name, COALESCE(language,'en'), COALESCE(body,''), COALESCE(header_type,''), status,
		        COALESCE((SELECT array_agg(value) FROM jsonb_array_elements_text(variables)), '{}')
		   FROM message_templates WHERE id=$1 AND organization_id=$2`,
		body.TemplateID, a.OrgID).Scan(&name, &lang, &bodyText, &headerType, &status, &vars)
	if err != nil {
		http.Error(w, "template not found", http.StatusNotFound)
		return
	}
	if status != "APPROVED" {
		http.Error(w, "template is not approved", http.StatusBadRequest)
		return
	}
	if len(body.Variables) < len(vars) {
		http.Error(w, "expected "+strconv.Itoa(len(vars))+" variable value(s)", http.StatusBadRequest)
		return
	}
	bodyParams := body.Variables[:len(vars)]

	// Rendered plain-text preview for persistence / inbox display.
	rendered := bodyText
	for i, v := range bodyParams {
		rendered = strings.ReplaceAll(rendered, "{{"+strconv.Itoa(i+1)+"}}", v)
	}

	// Sender channel: explicit (org-validated) else the first active one.
	var channelID string
	if body.ChannelID != "" {
		_ = s.pool.QueryRow(ctx,
			`SELECT id::text FROM channels WHERE organization_id=$1 AND id=$2 LIMIT 1`,
			a.OrgID, body.ChannelID).Scan(&channelID)
	}
	if channelID == "" {
		_ = s.pool.QueryRow(ctx,
			`SELECT id::text FROM channels WHERE organization_id=$1 AND is_active ORDER BY created_at LIMIT 1`,
			a.OrgID).Scan(&channelID)
	}
	if channelID == "" {
		http.Error(w, "no active channel", http.StatusBadRequest)
		return
	}

	type skip struct {
		ContactID string `json:"contact_id"`
		Reason    string `json:"reason"`
	}
	skipped := []skip{}
	queued := 0

	for _, id := range body.ContactIDs {
		var phone *string
		var blacklisted bool
		if err := s.pool.QueryRow(ctx,
			`SELECT phone, blacklisted FROM contacts WHERE id=$1 AND organization_id=$2`,
			id, a.OrgID).Scan(&phone, &blacklisted); err != nil {
			skipped = append(skipped, skip{id, "not found"})
			continue
		}
		if phone == nil || *phone == "" {
			skipped = append(skipped, skip{id, "no phone"})
			continue
		}
		if blacklisted {
			skipped = append(skipped, skip{id, "blacklisted"})
			continue
		}
		if err := s.bus.Publish(events.SubjectMessageOutbound, a.OrgID, events.MessageOutbound{
			ContactID:  id,
			ChannelID:  channelID,
			SenderType: "agent",
			SenderID:   a.UserID,
			Type:       "template",
			Body:       rendered,
			Template: &events.TemplateOutbound{
				Name:       name,
				Language:   lang,
				BodyParams: bodyParams,
				HeaderType: headerType,
			},
		}); err != nil {
			skipped = append(skipped, skip{id, err.Error()})
			continue
		}
		queued++
	}

	writeJSON(w, map[string]any{"queued": queued, "skipped": skipped})
}
