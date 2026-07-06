package main

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/google/uuid"
)

// ── Web API lead sources ────────────────────────────────────
// CRUD (JWT) + a public lead ingest endpoint keyed by API key.

// GET /api/web-api-sources
func (s *server) handleListWebAPISources(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	rows, err := s.queryMaps(r.Context(),
		`SELECT s.id::text AS id, s.name, s.slug, s.api_key, s.webhook_url,
		        s.auto_template_name, s.is_active, s.lead_count, s.created_at, s.updated_at,
		        s.platform, s.campaign_id::text AS campaign_id, c.name AS campaign_name
		   FROM web_api_sources s
		   LEFT JOIN campaigns c ON c.id = s.campaign_id
		  WHERE s.organization_id = $1
		  ORDER BY s.created_at`,
		a.OrgID,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

func newAPIKey() string {
	return "pk_" + strings.ReplaceAll(uuid.NewString(), "-", "")
}

type webAPISourceInput struct {
	Name             string `json:"name"`
	Slug             string `json:"slug"`
	AutoTemplateName string `json:"auto_template_name"`
	WebhookURL       string `json:"webhook_url"`
	CampaignID       string `json:"campaign_id"`
	// Platform tag (meta | tiktok | google | other) - drives the specific
	// "Meta Ads"/"TikTok Ads"/"Google Ads"/"Website" label shown consistently
	// across contacts, exports, and logs (same vocabulary as ad_accounts.platform).
	Platform string `json:"platform"`
}

var validWebAPISourcePlatforms = map[string]bool{"meta": true, "tiktok": true, "google": true, "other": true}

// POST /api/web-api-sources
func (s *server) handleCreateWebAPISource(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var b webAPISourceInput
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil || b.Name == "" {
		http.Error(w, "name required", http.StatusBadRequest)
		return
	}
	if b.Slug == "" {
		b.Slug = strings.ToLower(strings.ReplaceAll(strings.TrimSpace(b.Name), " ", "-"))
	}
	if b.Platform == "" {
		b.Platform = "other"
	}
	if !validWebAPISourcePlatforms[b.Platform] {
		http.Error(w, "invalid platform", http.StatusBadRequest)
		return
	}
	var id string
	err := s.pool.QueryRow(r.Context(),
		`INSERT INTO web_api_sources (organization_id, name, slug, api_key, auto_template_name, webhook_url, campaign_id, platform)
		 VALUES ($1,$2,$3,$4,NULLIF($5,''),NULLIF($6,''),NULLIF($7,'')::uuid,$8) RETURNING id::text`,
		a.OrgID, b.Name, b.Slug, newAPIKey(), b.AutoTemplateName, b.WebhookURL, b.CampaignID, b.Platform,
	).Scan(&id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.audit(r.Context(), a, "created", "web_api_source", id, map[string]any{"name": b.Name, "platform": b.Platform})
	writeJSON(w, map[string]any{"id": id})
}

// PATCH /api/web-api-sources/{id}
func (s *server) handleUpdateWebAPISource(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var b struct {
		Name             *string `json:"name"`
		Slug             *string `json:"slug"`
		AutoTemplateName *string `json:"auto_template_name"`
		WebhookURL       *string `json:"webhook_url"`
		IsActive         *bool   `json:"is_active"`
		CampaignID       *string `json:"campaign_id"`
		Platform         *string `json:"platform"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if b.Platform != nil && !validWebAPISourcePlatforms[*b.Platform] {
		http.Error(w, "invalid platform", http.StatusBadRequest)
		return
	}
	tag, err := s.pool.Exec(r.Context(),
		`UPDATE web_api_sources SET
		   name = COALESCE(NULLIF($3,''), name),
		   slug = COALESCE(NULLIF($4,''), slug),
		   auto_template_name = COALESCE($5, auto_template_name),
		   webhook_url = COALESCE($6, webhook_url),
		   is_active = COALESCE($7, is_active),
		   campaign_id = CASE WHEN $8::text IS NULL THEN campaign_id ELSE NULLIF($8,'')::uuid END,
		   platform = COALESCE($9, platform),
		   updated_at = now()
		 WHERE id=$1 AND organization_id=$2`,
		r.PathValue("id"), a.OrgID, derefStr(b.Name), derefStr(b.Slug),
		b.AutoTemplateName, b.WebhookURL, b.IsActive, b.CampaignID, b.Platform)
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

// POST /api/web-api-sources/{id}/regenerate-key
func (s *server) handleRegenerateWebAPIKey(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	key := newAPIKey()
	tag, err := s.pool.Exec(r.Context(),
		`UPDATE web_api_sources SET api_key=$3, updated_at=now() WHERE id=$1 AND organization_id=$2`,
		r.PathValue("id"), a.OrgID, key)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	writeJSON(w, map[string]any{"api_key": key})
}

// DELETE /api/web-api-sources/{id}
func (s *server) handleDeleteWebAPISource(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	tag, err := s.pool.Exec(r.Context(),
		`DELETE FROM web_api_sources WHERE id=$1 AND organization_id=$2`, r.PathValue("id"), a.OrgID)
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

// POST /v1/leads  (PUBLIC — authenticated by X-API-Key)
// External systems / ad platforms push leads here. Creates/updates the
// contact, attributes it to the source, opens a conversation, and (if the
// source is mapped to a campaign) routes round-robin to a campaign agent.
func (s *server) handleIngestLead(w http.ResponseWriter, r *http.Request) {
	key := r.Header.Get("X-API-Key")
	if key == "" {
		http.Error(w, "missing X-API-Key", http.StatusUnauthorized)
		return
	}
	var b struct {
		Phone   string `json:"phone"`
		Name    string `json:"name"`
		Message string `json:"message"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil || b.Phone == "" {
		http.Error(w, "phone required", http.StatusBadRequest)
		return
	}
	ctx := r.Context()

	var orgID, srcID, campaignID, branchID string
	var slug string
	err := s.pool.QueryRow(ctx,
		`SELECT organization_id::text, id::text, slug,
		        COALESCE(campaign_id::text,''), COALESCE(branch_id::text,'')
		   FROM web_api_sources WHERE api_key=$1 AND is_active`, key).Scan(&orgID, &srcID, &slug, &campaignID, &branchID)
	if err != nil {
		http.Error(w, "invalid api key", http.StatusUnauthorized)
		return
	}

	// Upsert contact by phone, attributed to this source.
	var contactID string
	err = s.pool.QueryRow(ctx,
		`INSERT INTO contacts (organization_id, phone, full_name, source_channel, web_api_source_id, external_ids)
		 VALUES ($1,$2,NULLIF($3,''),'web_api',$4, jsonb_build_object('web_api',$5::text))
		 ON CONFLICT (organization_id, phone)
		 DO UPDATE SET full_name = COALESCE(NULLIF(EXCLUDED.full_name,''), contacts.full_name),
		               web_api_source_id = EXCLUDED.web_api_source_id, updated_at = now()
		 RETURNING id::text`,
		orgID, b.Phone, b.Name, srcID, slug).Scan(&contactID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Open a conversation if none, and log the lead message.
	var convID string
	_ = s.pool.QueryRow(ctx,
		`SELECT id::text FROM conversations
		  WHERE organization_id=$1 AND contact_id=$2 AND status<>'closed'
		  ORDER BY last_message_at DESC NULLS LAST LIMIT 1`, orgID, contactID).Scan(&convID)
	if convID == "" {
		// Branch/campaign routing below assigns the agent; no department step.
		_ = s.pool.QueryRow(ctx,
			`INSERT INTO conversations (organization_id, contact_id, channel, status, is_bot_active)
			 VALUES ($1,$2,'web_api','open',true) RETURNING id::text`,
			orgID, contactID).Scan(&convID)
	}
	msg := b.Message
	if msg == "" {
		msg = "New lead from " + slug
	}
	if convID != "" {
		_, _ = s.pool.Exec(ctx,
			`INSERT INTO messages (organization_id, conversation_id, direction, sender_type, type, body, status, genuine)
			 VALUES ($1,$2,'inbound','contact','text',$3,'delivered',false)`, orgID, convID, msg)
		_, _ = s.pool.Exec(ctx,
			`UPDATE conversations SET last_message_at=now(), last_contact_message_at=now(),
			        last_message_preview=LEFT($2,200), unread_count=unread_count+1, updated_at=now() WHERE id=$1`,
			convID, msg)
	}
	_, _ = s.pool.Exec(ctx, `UPDATE web_api_sources SET lead_count=lead_count+1 WHERE id=$1`, srcID)

	// Source mapped to a branch (preferred) or campaign -> attribute + round-robin assign.
	if convID != "" {
		if branchID != "" {
			s.routeToBranch(ctx, branchID, convID)
		} else if campaignID != "" {
			s.routeToCampaign(ctx, campaignID, convID)
		}
	}

	writeJSON(w, map[string]any{"status": "captured", "contact_id": contactID, "conversation_id": convID})
}
