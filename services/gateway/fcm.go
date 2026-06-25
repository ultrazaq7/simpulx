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

		// Only push to agents if it's an inbound message
		if msg.Direction != "inbound" {
			return nil
		}

		var assignedAgentID *string
		var contactName, contactPhone string

		// Resolve via the conversation (its contact), not the event's ContactID which
		// can be empty — otherwise the title falls back to a generic "New Contact".
		_ = s.pool.QueryRow(ctx,
			`SELECT cv.assigned_agent_id::text, COALESCE(ct.full_name,''), COALESCE(ct.phone,'')
			   FROM conversations cv LEFT JOIN contacts ct ON ct.id = cv.contact_id
			  WHERE cv.id=$1`, msg.ConversationID).Scan(&assignedAgentID, &contactName, &contactPhone)

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
			// Notify all active agents in org
			rows, _ = s.queryMaps(ctx, `
				SELECT DISTINCT t.token 
				FROM fcm_tokens t
				JOIN users u ON u.id = t.user_id
				WHERE u.organization_id = $1 AND u.status = 'active'
			`, env.OrgID)
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
		_, err := fcmClient.SendEachForMulticast(ctx, &messaging.MulticastMessage{
			Tokens:  tokens,
			Data:    map[string]string{"title": n.Title, "body": n.Body, "conversationId": n.ConversationID, "type": notifType},
			Android: &messaging.AndroidConfig{Priority: "high"},
		})
		if err != nil {
			s.log.Error("FCM notification send error", "err", err)
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

		data := map[string]string{
			"conversationId": c.ConversationID,
			"callId":         c.CallID,
			"callStatus":     c.CallStatus,
			"body":           "WhatsApp voice call",
		}
		if c.CallStatus == "incoming" {
			title := "Incoming call"
			if c.ContactName != "" {
				title += " from " + c.ContactName
			} else if c.ContactPhone != "" {
				title += " from " + c.ContactPhone
			}
			data["type"] = "incoming_call"
			data["title"] = title
		} else { // ended
			missed := c.DurationSeconds == 0
			title := "Call ended"
			if missed {
				title = "Missed call"
				if c.ContactName != "" {
					title += " from " + c.ContactName
				} else if c.ContactPhone != "" {
					title += " from " + c.ContactPhone
				}
			}
			data["type"] = "call_ended"
			data["title"] = title
			data["missed"] = strconv.FormatBool(missed)
		}

		_, err := fcmClient.SendEachForMulticast(ctx, &messaging.MulticastMessage{
			Tokens:  tokens,
			Data:    data,
			Android: &messaging.AndroidConfig{Priority: "high"},
		})
		if err != nil {
			s.log.Error("FCM call push error", "err", err)
		}
		return nil
	})
	if err != nil {
		s.log.Error("Failed to subscribe to FCM call push", "err", err)
	}
}
