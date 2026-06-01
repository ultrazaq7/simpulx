package main

import (
	"context"
	"encoding/json"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/messaging"
	"google.golang.org/api/option"

	"github.com/simpulx/v2/libs/go/config"
	"github.com/simpulx/v2/libs/go/events"
)

func (s *server) initFCMPush(ctx context.Context) {
	// Initialize Firebase app
	keyFile := config.Get("GOOGLE_APPLICATION_CREDENTIALS", "")
	mockMode := config.Get("FCM_MOCK", "true") == "true"
	
	var app *firebase.App
	var fcmClient *messaging.Client
	var err error
	
	if !mockMode {
		var opts []option.ClientOption
		if keyFile != "" {
			opts = append(opts, option.WithCredentialsFile(keyFile))
		}
		app, err = firebase.NewApp(ctx, nil, opts...)
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
		var contactName string
		
		_ = s.pool.QueryRow(ctx, `SELECT assigned_agent_id::text FROM conversations WHERE id=$1`, msg.ConversationID).Scan(&assignedAgentID)
		_ = s.pool.QueryRow(ctx, `SELECT full_name FROM contacts WHERE id=$1`, msg.ContactID).Scan(&contactName)
		
		if contactName == "" {
			contactName = "New Contact"
		}

		// Get tokens
		var rows []map[string]any
		if assignedAgentID != nil {
			rows, _ = s.queryMaps(ctx, `SELECT token FROM fcm_tokens WHERE user_id=$1`, *assignedAgentID)
		} else {
			// Notify all active agents in org
			rows, _ = s.queryMaps(ctx, `
				SELECT t.token 
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
		pushMsg := &messaging.MulticastMessage{
			Tokens: tokens,
			Notification: &messaging.Notification{
				Title: contactName,
				Body:  bodyText,
			},
			Data: map[string]string{
				"conversationId": msg.ConversationID,
				"contactId":      msg.ContactID,
				"type":           "new_message",
			},
			Android: &messaging.AndroidConfig{
				Priority: "high",
			},
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
}
