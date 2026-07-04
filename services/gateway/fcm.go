package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"strconv"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/messaging"
	"google.golang.org/api/option"

	"github.com/simpulx/v2/libs/go/config"
	"github.com/simpulx/v2/libs/go/events"
)

func (s *server) initFCMPush(ctx context.Context) {
	// Initialize Firebase app. Credentials come from FCM_CREDENTIALS_JSON (the
	// service-account JSON inline, preferred for our .env deploy) or a file path.
	keyFile := config.Get("GOOGLE_APPLICATION_CREDENTIALS", "")
	credJSON := config.Get("FCM_CREDENTIALS_JSON", "")
	if b64 := config.Get("FCM_CREDENTIALS_JSON_B64", ""); b64 != "" {
		if dec, err := base64.StdEncoding.DecodeString(b64); err == nil {
			credJSON = string(dec)
		}
	}
	mockMode := config.Get("FCM_MOCK", "true") == "true"

	var app *firebase.App
	var fcmClient *messaging.Client
	var err error

	if !mockMode {
		var opts []option.ClientOption
		var cfg *firebase.Config
		if credJSON != "" {
			opts = append(opts, option.WithCredentialsJSON([]byte(credJSON)))
			// Pin the project from the service account so Messaging can resolve it
			// (auto-detection from inline JSON creds is unreliable).
			var sa struct {
				ProjectID string `json:"project_id"`
			}
			if json.Unmarshal([]byte(credJSON), &sa) == nil && sa.ProjectID != "" {
				cfg = &firebase.Config{ProjectID: sa.ProjectID}
			}
		} else if keyFile != "" {
			opts = append(opts, option.WithCredentialsFile(keyFile))
		}
		app, err = firebase.NewApp(ctx, cfg, opts...)
		if err != nil {
			s.log.Warn("Failed to init firebase app", "err", err)
		} else {
			fcmClient, err = app.Messaging(ctx)
			if err != nil {
				s.log.Warn("Failed to init FCM messaging client", "err", err)
			}
		}
	} else {
		s.log.Info("FCM is running in MOCK mode. No actual pushes will be sent to Google.")
	}

	// Subscribe to message.persisted
	err = s.bus.Subscribe(events.SubjectMessagePersisted, "gateway-fcm-push", func(env events.Envelope) error {
		var msg events.MessagePersisted
		if err := json.Unmarshal(env.Data, &msg); err != nil {
			return err
		}

		// Only push to agents for real inbound CONTACT messages. Call-summary
		// bubbles (type=call, sender system) are timeline markers - the call FCM
		// path already covers their notifications. MediaUpdated is a re-publish
		// that only fills media_url in - never a fresh message.
		if msg.Direction != "inbound" || msg.Type == "call" || msg.SenderType == "system" || msg.MediaUpdated {
			return nil
		}

		var assignedAgentID, campaignID, branchID *string
		var contactName, contactPhone string

		// Resolve via the conversation (its contact), not the event's ContactID which
		// can be empty — otherwise the title falls back to a generic "New Contact".
		_ = s.pool.QueryRow(ctx,
			`SELECT cv.assigned_agent_id::text, cv.campaign_id::text, cv.branch_id::text,
			        COALESCE(ct.full_name,''), COALESCE(ct.phone,'')
			   FROM conversations cv LEFT JOIN contacts ct ON ct.id = cv.contact_id
			  WHERE cv.id=$1`, msg.ConversationID).Scan(&assignedAgentID, &campaignID, &branchID, &contactName, &contactPhone)

		if contactName == "" {
			contactName = contactPhone
		}
		if contactName == "" {
			contactName = "New message"
		}

		// Get tokens
		var rows []map[string]any
		if assignedAgentID != nil {
			rows, _ = s.queryMaps(ctx, `SELECT DISTINCT token FROM fcm_tokens WHERE user_id=$1`, *assignedAgentID)
		} else {
			// Unassigned: only notify users who can actually SEE the lead (RBAC) —
			// admins/owners (all) + managers of the conversation's campaign/branch.
			// Previously this blasted EVERY active user, so agents got pushes for
			// leads that were never (or no longer) routed to them.
			rows, _ = s.queryMaps(ctx, `
				SELECT DISTINCT t.token
				FROM fcm_tokens t
				JOIN users u ON u.id = t.user_id
				WHERE u.organization_id = $1 AND u.status = 'active'
				  AND (
				    u.role IN ('admin','owner')
				    OR (u.role = 'manager' AND (
				         $2::uuid IN (SELECT campaign_id FROM campaign_agents WHERE user_id = u.id)
				      OR $3::uuid IN (SELECT branch_id   FROM branch_agents   WHERE user_id = u.id)
				    ))
				  )
			`, env.OrgID, campaignID, branchID)
		}

		if len(rows) == 0 {
			return nil
		}

		tokens := make([]string, 0, len(rows))
		for _, r := range rows {
			if t, ok := r["token"].(string); ok {
				tokens = append(tokens, t)
			}
		}

		if len(tokens) == 0 {
			return nil
		}

		bodyText := msg.Preview
		if bodyText == "" {
			bodyText = "Sent a message"
		}

		s.log.Info("Sending push notification", "to", len(tokens), "tokens", "mock", mockMode, "contact", contactName, "body", bodyText)

		if mockMode || fcmClient == nil {
			return nil
		}

		// Send via FCM
		// Data-only (no Notification payload): the service worker renders it once.
		// A Notification payload would be auto-shown AND re-shown by the SW (double).
		pushMsg := &messaging.MulticastMessage{
			Tokens: tokens,
			Data: map[string]string{
				"title":          contactName,
				"body":           bodyText,
				"conversationId": msg.ConversationID,
				"contactId":      msg.ContactID,
				"type":           "new_message",
			},
			Android: &messaging.AndroidConfig{Priority: "high"},
		}

		resp, err := fcmClient.SendEachForMulticast(ctx, pushMsg)
		if err != nil {
			s.log.Error("FCM send error", "err", err)
		} else {
			s.log.Info("FCM sent", "successCount", resp.SuccessCount, "failureCount", resp.FailureCount)
			s.pruneInvalidTokens(ctx, tokens, resp)
		}
		return nil
	})

	if err != nil {
		s.log.Error("Failed to subscribe to FCM push", "err", err)
	}

	// Push bell notifications (snooze-due, assignment, ...) to the recipient's browser.
	err = s.bus.Subscribe(events.SubjectNotificationCreated, "gateway-fcm-notif", func(env events.Envelope) error {
		var n events.NotificationCreated
		if err := json.Unmarshal(env.Data, &n); err != nil || n.UserID == "" {
			return err
		}
		rows, _ := s.queryMaps(ctx, `SELECT DISTINCT token FROM fcm_tokens WHERE user_id=$1`, n.UserID)
		tokens := make([]string, 0, len(rows))
		for _, r := range rows {
			if t, ok := r["token"].(string); ok && t != "" {
				tokens = append(tokens, t)
			}
		}
		if len(tokens) == 0 || mockMode || fcmClient == nil {
			return nil
		}
		notifType := n.Type
		if notifType == "" {
			notifType = "notification"
		}
		resp, err := fcmClient.SendEachForMulticast(ctx, &messaging.MulticastMessage{
			Tokens:  tokens,
			Data:    map[string]string{"title": n.Title, "body": n.Body, "conversationId": n.ConversationID, "type": notifType},
			Android: &messaging.AndroidConfig{Priority: "high"},
		})
		if err != nil {
			s.log.Error("FCM notification send error", "err", err)
		} else {
			s.pruneInvalidTokens(ctx, tokens, resp)
		}
		return nil
	})
	if err != nil {
		s.log.Error("Failed to subscribe to FCM notif push", "err", err)
	}

	// Push inbound call state to agents' devices. We deliberately push only two
	// states, with an explicit `type`/`callStatus` contract the device branches on:
	//   - "incoming": ring the assigned agent (full-screen call notification).
	//   - "ended":    DISMISS the ring. A call broadcasts `ended` more than once
	//                 (agent hangup + Meta's `terminate` webhook; decline), so the
	//                 device MUST treat this as "cancel", never as a fresh ring —
	//                 otherwise declining/ending re-opens the call notification.
	// The `missed` flag lets the device surface a lightweight "missed call" note
	// (auto-cancel, no ringtone) only when the call was never answered.
	err = s.bus.Subscribe(events.SubjectCallUpdated, "gateway-fcm-call", func(env events.Envelope) error {
		var c events.CallUpdated
		if err := json.Unmarshal(env.Data, &c); err != nil {
			return err
		}

		if c.Direction != "inbound" || (c.CallStatus != "incoming" && c.CallStatus != "ended") {
			return nil
		}

		var rows []map[string]any
		if c.AgentID != "" {
			rows, _ = s.queryMaps(ctx, `SELECT DISTINCT token FROM fcm_tokens WHERE user_id=$1`, c.AgentID)
		} else {
			rows, _ = s.queryMaps(ctx, `
				SELECT DISTINCT t.token
				FROM fcm_tokens t
				JOIN users u ON u.id = t.user_id
				WHERE u.organization_id = $1 AND u.status = 'active'
			`, env.OrgID)
		}

		tokens := make([]string, 0, len(rows))
		for _, r := range rows {
			if t, ok := r["token"].(string); ok && t != "" {
				tokens = append(tokens, t)
			}
		}

		if len(tokens) == 0 || mockMode || fcmClient == nil {
			return nil
		}

		// The "ended" broadcast (unlike the ring) doesn't carry the contact
		// identity, so look it up from the conversation. The device needs it to
		// render a WhatsApp-style missed-call note (name + avatar).
		contactName, contactPhone := c.ContactName, c.ContactPhone
		if contactName == "" && c.ConversationID != "" {
			_ = s.pool.QueryRow(ctx,
				`SELECT COALESCE(ct.full_name,''), COALESCE(ct.phone,'')
				   FROM conversations cv JOIN contacts ct ON ct.id = cv.contact_id
				  WHERE cv.id = $1`, c.ConversationID).Scan(&contactName, &contactPhone)
		}

		data := map[string]string{
			"conversationId": c.ConversationID,
			"callId":         c.CallID,
			"callStatus":     c.CallStatus,
			"body":           "WhatsApp voice call",
			// Carry the contact identity so the device can render a proper
			// WhatsApp-style missed-call note (name + avatar), not a raw title.
			"contactName":  contactName,
			"contactPhone": contactPhone,
		}
		if c.CallStatus == "incoming" {
			title := "Incoming call"
			if contactName != "" {
				title += " from " + contactName
			} else if contactPhone != "" {
				title += " from " + contactPhone
			}
			data["type"] = "incoming_call"
			data["title"] = title
		} else { // ended
			// "Missed" means the customer rang and nobody picked up. A call the
			// agent actively declined (rejected) or hung up (agent_hangup), or one
			// denied by permission, is NOT missed, so it must not spawn a "Missed
			// call" note every time the agent declines.
			missed := c.DurationSeconds == 0 &&
				c.EndReason != "rejected" &&
				c.EndReason != "declined" &&
				c.EndReason != "agent_hangup" &&
				c.EndReason != "permission_denied"
			title := "Call ended"
			if missed {
				title = "Missed call"
				if contactName != "" {
					title += " from " + contactName
				} else if contactPhone != "" {
					title += " from " + contactPhone
				}
			}
			data["type"] = "call_ended"
			data["title"] = title
			data["missed"] = strconv.FormatBool(missed)
		}

		resp, err := fcmClient.SendEachForMulticast(ctx, &messaging.MulticastMessage{
			Tokens:  tokens,
			Data:    data,
			Android: &messaging.AndroidConfig{Priority: "high"},
		})
		if err != nil {
			s.log.Error("FCM call push error", "err", err)
		} else {
			s.pruneInvalidTokens(ctx, tokens, resp)
		}
		return nil
	})
	if err != nil {
		s.log.Error("Failed to subscribe to FCM call push", "err", err)
	}
}

// pruneInvalidTokens removes FCM tokens that the server rejected as unregistered
// or invalid (e.g. the app was uninstalled, or the client deleted its token on
// logout). This keeps us from pushing to dead devices indefinitely.
func (s *server) pruneInvalidTokens(ctx context.Context, tokens []string, resp *messaging.BatchResponse) {
	if resp == nil {
		return
	}
	var bad []string
	for i, r := range resp.Responses {
		if r.Success || i >= len(tokens) {
			continue
		}
		if messaging.IsUnregistered(r.Error) || messaging.IsInvalidArgument(r.Error) {
			bad = append(bad, tokens[i])
		}
	}
	if len(bad) == 0 {
		return
	}
	if _, err := s.pool.Exec(ctx, `DELETE FROM fcm_tokens WHERE token = ANY($1)`, bad); err != nil {
		s.log.Warn("prune fcm tokens failed", "err", err)
		return
	}
	s.log.Info("pruned invalid fcm tokens", "count", len(bad))
}
