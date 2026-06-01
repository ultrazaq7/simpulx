package main

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

// runFollowUpCron runs periodically and triggers auto follow-up for idle leads
func (s *server) runFollowUpCron(ctx context.Context) {
	ticker := time.NewTicker(15 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.triggerFollowUps(ctx)
		}
	}
}

func (s *server) triggerFollowUps(ctx context.Context) {
	// Find conversations where:
	// - is_bot_active = true
	// - status = 'open'
	// - last_message_at < NOW() - 4 hours
	// - followup_count < 3 (max 3 follow ups)
	// - We need to know who sent the last message. Usually, follow up is sent if contact hasn't replied, or agent hasn't replied.
	// Rule: the customer messaged last, it's been quiet for 4h, AND no rep/bot
	// has replied since (last_agent_message_at covers agent + bot outbound). This
	// is the "customer diam 4 jam DAN sales belum follow-up" trigger. A sent
	// follow-up bumps last_agent_message_at, so it won't re-fire until the
	// customer speaks again; followup_count is the lifetime safety cap.
	rows, err := s.queryMaps(ctx, `
		SELECT id::text AS id, organization_id::text AS org_id
		FROM conversations
		WHERE is_bot_active = true
		  AND status = 'open'
		  AND last_contact_message_at IS NOT NULL
		  AND last_contact_message_at < NOW() - INTERVAL '4 hours'
		  AND (last_agent_message_at IS NULL OR last_agent_message_at < last_contact_message_at)
		  AND followup_count < 3
		  AND NOT classification_locked
	`)
	if err != nil {
		s.log.Warn("failed to fetch followups", "err", err)
		return
	}

	for _, row := range rows {
		convID := row["id"].(string)
		orgID := row["org_id"].(string)

		// Increment followup count
		_, err := s.pool.Exec(ctx, `UPDATE conversations SET followup_count = followup_count + 1 WHERE id = $1`, convID)
		if err != nil {
			s.log.Warn("failed to update followup_count", "err", err, "conv", convID)
			continue
		}

		// Request AI to draft a follow up
		payload, _ := json.Marshal(map[string]any{
			"conversation_id": convID,
			"org_id":          orgID,
		})
		
		// Note: We use a fire-and-forget POST to the AI Agent /followup endpoint
		req, _ := http.NewRequestWithContext(ctx, http.MethodPost, s.aiAgentURL+"/followup", strings.NewReader(string(payload)))
		req.Header.Set("Content-Type", "application/json")
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			s.log.Warn("failed to trigger ai followup", "err", err, "conv", convID)
		} else {
			resp.Body.Close()
		}
	}
}

// ── Aggressive Notifications ─────────────────────────────────
func (s *server) runAggressiveNotifications(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.triggerNotifications(ctx)
		}
	}
}

func (s *server) triggerNotifications(ctx context.Context) {
	// Find unreplied leads for human agents (bot inactive or unassigned)
	rows, err := s.queryMaps(ctx, `
		SELECT id::text AS id, organization_id::text AS org_id, assigned_agent_id::text AS agent_id
		FROM conversations 
		WHERE is_bot_active = false 
		  AND status = 'open'
		  AND last_contact_message_at < NOW() - INTERVAL '15 minutes'
		  AND (last_agent_message_at IS NULL OR last_agent_message_at < last_contact_message_at)
	`)
	if err != nil {
		s.log.Warn("failed to fetch unreplied leads for notif", "err", err)
		return
	}

	for _, row := range rows {
		convID := row["id"].(string)
		orgID := row["org_id"].(string)

		payload, _ := json.Marshal(map[string]any{
			"type": "alert",
			"title": "Lead Pending Reply",
			"body": "A lead has been waiting for a reply for over 15 minutes!",
			"conversation_id": convID,
		})
		_ = s.bus.Publish("events.notification.alert", orgID, payload)
	}
}
