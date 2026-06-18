package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/simpulx/v2/libs/go/config"
	"github.com/simpulx/v2/libs/go/events"
)

// ── WhatsApp Business Calling API ───────────────────────────────────────────
// Flow:
//  1. Agent clicks Call → POST /api/calls/request-permission
//     Gateway sends a call_permission_request template message to customer.
//  2. Customer taps Allow → webhook delivers permission_granted
//     Gateway updates DB + broadcasts events.call.updated via NATS/WS.
//  3. Agent clicks Call Now → POST /api/calls/initiate { call_id, sdp_offer }
//     Gateway forwards SDP offer to POST /{phone}/calls on Meta Graph API.
//  4. Meta relays SDP answer via webhook → gateway broadcasts to agent's WS.
//  5. Browser establishes WebRTC peer connection for live audio.

var graphBase = config.Get("WA_GRAPH_BASE", "https://graph.facebook.com/v21.0")

// ── Request Call Permission ─────────────────────────────────────────────────

// POST /api/calls/request-permission
// Body: { "conversation_id": "..." }
func (s *server) handleRequestCallPermission(w http.ResponseWriter, r *http.Request) {
	a := r.Context().Value(authCtxKey).(authInfo)
	var body struct {
		ConversationID string `json:"conversation_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.ConversationID == "" {
		http.Error(w, "conversation_id required", http.StatusBadRequest)
		return
	}

	// Resolve conversation → channel + contact phone
	var channelID, phoneNumberID, accessToken, contactPhone string
	err := s.pool.QueryRow(r.Context(),
		`SELECT ch.id::text, ch.phone_number_id, ch.access_token,
		        ct.phone
		   FROM conversations cv
		   JOIN contacts ct ON ct.id = cv.contact_id
		   JOIN channels ch ON ch.id = cv.channel_id
		  WHERE cv.id = $1 AND cv.organization_id = $2`,
		body.ConversationID, a.OrgID,
	).Scan(&channelID, &phoneNumberID, &accessToken, &contactPhone)
	if err != nil {
		http.Error(w, "conversation not found", http.StatusNotFound)
		return
	}

	// Check rate limit: max 1 request per 24h per contact
	var recentCount int
	_ = s.pool.QueryRow(r.Context(),
		`SELECT count(*) FROM calls
		  WHERE conversation_id = $1 AND permission_requested_at > now() - interval '24 hours'`,
		body.ConversationID,
	).Scan(&recentCount)
	if recentCount >= 1 {
		http.Error(w, "call permission already requested in the last 24 hours", http.StatusTooManyRequests)
		return
	}

	// Insert call record
	callID := uuid.NewString()
	now := time.Now()
	_, err = s.pool.Exec(r.Context(),
		`INSERT INTO calls (id, organization_id, conversation_id, channel_id, agent_id, contact_phone,
		                    permission_status, call_status, permission_requested_at)
		 VALUES ($1, $2, $3, $4::uuid, $5::uuid, $6, 'pending', 'requesting', $7)`,
		callID, a.OrgID, body.ConversationID, channelID, a.UserID, contactPhone, now,
	)
	if err != nil {
		s.log.Error("insert call failed", "err", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	// Send call_permission_request via Meta Messages API
	// This sends an interactive message the customer can Allow/Deny
	wamid, err := s.sendCallPermissionRequest(r.Context(), phoneNumberID, accessToken, contactPhone, callID)
	if err != nil {
		s.log.Error("send call permission failed", "err", err)
		// Update call as failed
		_, _ = s.pool.Exec(r.Context(),
			`UPDATE calls SET call_status = 'failed', end_reason = $2 WHERE id = $1`,
			callID, err.Error())
		http.Error(w, "failed to send permission request: "+err.Error(), http.StatusBadGateway)
		return
	}

	// Store the wamid so we can match the webhook reply
	_, _ = s.pool.Exec(r.Context(),
		`UPDATE calls SET permission_msg_id = $2 WHERE id = $1`, callID, wamid)

	// Insert a system message in the conversation
	_, _ = s.pool.Exec(r.Context(),
		`INSERT INTO messages (organization_id, conversation_id, direction, sender_type, type, body, preview)
		 VALUES ($1, $2, 'outbound', 'system', 'text',
		         '📞 Business call request sent — Awaiting customer approval',
		         '📞 Call request sent')`,
		a.OrgID, body.ConversationID)

	// Broadcast update
	s.broadcastCallUpdate(r.Context(), a.OrgID, callID, body.ConversationID, "pending", "requesting", "", "", 0)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"call_id": callID,
		"status":  "requesting",
	})
}

// sendCallPermissionRequest sends a call_permission_request interactive message.
func (s *server) sendCallPermissionRequest(ctx context.Context, phoneNumberID, token, to, callID string) (string, error) {
	if config.GetBool("WA_MOCK", true) || token == "" {
		// Mock mode: return fake wamid
		return "wamid.MOCK-CPR-" + callID[:8], nil
	}

	payload := map[string]any{
		"messaging_product": "whatsapp",
		"to":                to,
		"type":              "interactive",
		"interactive": map[string]any{
			"type": "call_permission",
			"body": map[string]string{
				"text": "Kami ingin menghubungi Anda melalui WhatsApp. Apakah Anda bersedia menerima panggilan?",
			},
			"action": map[string]any{
				"name": "call_permission",
				"parameters": map[string]any{
					"permission_type": "temporary",
					"call_context":    callID,
				},
			},
		},
	}

	url := fmt.Sprintf("%s/%s/messages", graphBase, phoneNumberID)
	buf, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(buf))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("meta API error %d: %s", resp.StatusCode, string(respBody))
	}

	var out struct {
		Messages []struct {
			ID string `json:"id"`
		} `json:"messages"`
	}
	_ = json.Unmarshal(respBody, &out)
	if len(out.Messages) > 0 {
		return out.Messages[0].ID, nil
	}
	return "", nil
}

// ── Initiate Call ───────────────────────────────────────────────────────────

// POST /api/calls/initiate
// Body: { "call_id": "...", "sdp_offer": "..." }
func (s *server) handleInitiateCall(w http.ResponseWriter, r *http.Request) {
	a := r.Context().Value(authCtxKey).(authInfo)
	var body struct {
		CallID   string `json:"call_id"`
		SDPOffer string `json:"sdp_offer"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.CallID == "" || body.SDPOffer == "" {
		http.Error(w, "call_id and sdp_offer required", http.StatusBadRequest)
		return
	}

	// Verify permission is granted
	var channelID, phoneNumberID, accessToken, contactPhone, permStatus string
	err := s.pool.QueryRow(r.Context(),
		`SELECT c.channel_id::text, ch.phone_number_id, ch.access_token, c.contact_phone, c.permission_status
		   FROM calls c
		   JOIN channels ch ON ch.id = c.channel_id
		  WHERE c.id = $1 AND c.organization_id = $2`,
		body.CallID, a.OrgID,
	).Scan(&channelID, &phoneNumberID, &accessToken, &contactPhone, &permStatus)
	if err != nil {
		http.Error(w, "call not found", http.StatusNotFound)
		return
	}
	if permStatus != "granted" {
		http.Error(w, "call permission not yet granted (status: "+permStatus+")", http.StatusConflict)
		return
	}

	// Store SDP offer
	_, _ = s.pool.Exec(r.Context(),
		`UPDATE calls SET sdp_offer = $2, call_status = 'ringing', call_initiated_at = now() WHERE id = $1`,
		body.CallID, body.SDPOffer)

	// POST to Meta /calls endpoint
	extCallID, err := s.postMetaCallInitiate(r.Context(), phoneNumberID, accessToken, contactPhone, body.SDPOffer, body.CallID)
	if err != nil {
		s.log.Error("meta call initiate failed", "err", err)
		_, _ = s.pool.Exec(r.Context(),
			`UPDATE calls SET call_status = 'failed', end_reason = $2 WHERE id = $1`,
			body.CallID, err.Error())

		var convID string
		_ = s.pool.QueryRow(r.Context(), `SELECT conversation_id::text FROM calls WHERE id=$1`, body.CallID).Scan(&convID)
		s.broadcastCallUpdate(r.Context(), a.OrgID, body.CallID, convID, "granted", "failed", "", err.Error(), 0)

		http.Error(w, "call initiation failed: "+err.Error(), http.StatusBadGateway)
		return
	}

	_, _ = s.pool.Exec(r.Context(),
		`UPDATE calls SET external_call_id = $2 WHERE id = $1`, body.CallID, extCallID)

	var convID string
	_ = s.pool.QueryRow(r.Context(), `SELECT conversation_id::text FROM calls WHERE id=$1`, body.CallID).Scan(&convID)
	s.broadcastCallUpdate(r.Context(), a.OrgID, body.CallID, convID, "granted", "ringing", "", "", 0)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"call_id":          body.CallID,
		"external_call_id": extCallID,
		"status":           "ringing",
	})
}

// postMetaCallInitiate sends the WebRTC SDP offer to Meta's /calls endpoint.
func (s *server) postMetaCallInitiate(ctx context.Context, phoneNumberID, token, to, sdpOffer, callID string) (string, error) {
	if config.GetBool("WA_MOCK", true) || token == "" {
		return "wacid.MOCK-" + callID[:8], nil
	}

	payload := map[string]any{
		"messaging_product": "whatsapp",
		"to":                to,
		"action":            "connect",
		"session": map[string]string{
			"sdp_type": "offer",
			"sdp":      sdpOffer,
		},
	}

	url := fmt.Sprintf("%s/%s/calls", graphBase, phoneNumberID)
	buf, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(buf))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("meta calls API error %d: %s", resp.StatusCode, string(respBody))
	}

	var out struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(respBody, &out)
	return out.ID, nil
}

// ── End Call ────────────────────────────────────────────────────────────────

// POST /api/calls/{id}/end
func (s *server) handleEndCall(w http.ResponseWriter, r *http.Request) {
	a := r.Context().Value(authCtxKey).(authInfo)
	callID := r.PathValue("id")

	var convID, extCallID, phoneNumberID, accessToken, callStatus string
	err := s.pool.QueryRow(r.Context(),
		`SELECT c.conversation_id::text, COALESCE(c.external_call_id,''), ch.phone_number_id, ch.access_token, c.call_status
		   FROM calls c JOIN channels ch ON ch.id = c.channel_id
		  WHERE c.id = $1 AND c.organization_id = $2`,
		callID, a.OrgID,
	).Scan(&convID, &extCallID, &phoneNumberID, &accessToken, &callStatus)
	if err != nil {
		http.Error(w, "call not found", http.StatusNotFound)
		return
	}

	// Terminate on Meta if call was active
	if extCallID != "" && (callStatus == "ringing" || callStatus == "connected") {
		_ = s.postMetaCallTerminate(r.Context(), phoneNumberID, accessToken, extCallID)
	}

	// Calculate duration
	_, _ = s.pool.Exec(r.Context(),
		`UPDATE calls SET
		   call_status = 'ended',
		   call_ended_at = now(),
		   end_reason = 'agent_hangup',
		   duration_seconds = COALESCE(EXTRACT(EPOCH FROM (now() - call_connected_at))::int, 0),
		   sdp_offer = NULL, sdp_answer = NULL
		 WHERE id = $1`, callID)

	var dur int
	_ = s.pool.QueryRow(r.Context(), `SELECT duration_seconds FROM calls WHERE id=$1`, callID).Scan(&dur)

	// Insert call end system message
	if dur > 0 {
		mins := dur / 60
		secs := dur % 60
		_, _ = s.pool.Exec(r.Context(),
			`INSERT INTO messages (organization_id, conversation_id, direction, sender_type, type, body, preview)
			 VALUES ($1, $2, 'outbound', 'system', 'text',
			         $3, $3)`,
			a.OrgID, convID, fmt.Sprintf("📞 Voice call ended — %d:%02d", mins, secs))
	}

	s.broadcastCallUpdate(r.Context(), a.OrgID, callID, convID, "", "ended", "", "agent_hangup", dur)
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]any{"status": "ended", "duration_seconds": dur})
}

// postMetaCallTerminate ends an active call on Meta's side.
func (s *server) postMetaCallTerminate(ctx context.Context, phoneNumberID, token, extCallID string) error {
	if config.GetBool("WA_MOCK", true) || token == "" {
		return nil
	}
	payload := map[string]any{
		"messaging_product": "whatsapp",
		"action":            "terminate",
	}
	url := fmt.Sprintf("%s/%s/calls/%s", graphBase, phoneNumberID, extCallID)
	buf, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(buf))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()
	return nil
}

// ── Get Call ────────────────────────────────────────────────────────────────

// GET /api/calls/{id}
func (s *server) handleGetCall(w http.ResponseWriter, r *http.Request) {
	a := r.Context().Value(authCtxKey).(authInfo)
	callID := r.PathValue("id")

	rows, err := s.queryMaps(r.Context(),
		`SELECT id::text, conversation_id::text, permission_status, call_status,
		        external_call_id, duration_seconds, end_reason, created_at
		   FROM calls WHERE id = $1 AND organization_id = $2`,
		callID, a.OrgID)
	if err != nil || len(rows) == 0 {
		http.Error(w, "call not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(rows[0])
}

// ── Webhook: Call Events ────────────────────────────────────────────────────

// processCallWebhook handles the "calls" field from Meta webhooks.
// Events: permission_granted/denied, SDP answer, call status (ringing, accepted, ended).
func (s *server) processCallWebhook(ctx context.Context, orgID string, rawCalls json.RawMessage) {
	var callEvents []struct {
		ID      string `json:"id"`
		Event   string `json:"event"`
		From    string `json:"from"`
		Session struct {
			SDPType string `json:"sdp_type"`
			SDP     string `json:"sdp"`
		} `json:"session"`
		Status  string `json:"status"`
		Context struct {
			CallContext string `json:"call_context"` // our call_id
		} `json:"context"`
	}
	if err := json.Unmarshal(rawCalls, &callEvents); err != nil {
		s.log.Warn("decode call webhook failed", "err", err)
		return
	}

	for _, ce := range callEvents {
		s.log.Info("call webhook event", "event", ce.Event, "status", ce.Status,
			"call_id", ce.Context.CallContext, "ext_id", ce.ID)

		callID := ce.Context.CallContext
		if callID == "" {
			// Try matching by external_call_id
			_ = s.pool.QueryRow(ctx,
				`SELECT id::text FROM calls WHERE external_call_id = $1 AND organization_id = $2`,
				ce.ID, orgID).Scan(&callID)
		}
		if callID == "" {
			s.log.Warn("call webhook: no matching call record", "ext_id", ce.ID)
			continue
		}

		var convID string
		_ = s.pool.QueryRow(ctx, `SELECT conversation_id::text FROM calls WHERE id=$1`, callID).Scan(&convID)

		switch ce.Event {
		case "permission_granted", "call_permission_granted":
			_, _ = s.pool.Exec(ctx,
				`UPDATE calls SET permission_status = 'granted', permission_granted_at = now() WHERE id = $1`,
				callID)
			s.broadcastCallUpdate(ctx, orgID, callID, convID, "granted", "idle", "", "", 0)

			// Insert system message
			_, _ = s.pool.Exec(ctx,
				`INSERT INTO messages (organization_id, conversation_id, direction, sender_type, type, body, preview)
				 VALUES ($1, $2, 'inbound', 'system', 'text',
				         '✅ Customer approved call request', '✅ Call approved')`,
				orgID, convID)

		case "permission_denied", "call_permission_denied":
			_, _ = s.pool.Exec(ctx,
				`UPDATE calls SET permission_status = 'denied', call_status = 'ended', end_reason = 'permission_denied' WHERE id = $1`,
				callID)
			s.broadcastCallUpdate(ctx, orgID, callID, convID, "denied", "ended", "", "permission_denied", 0)

		case "connect":
			// SDP answer from Meta
			if ce.Session.SDPType == "answer" && ce.Session.SDP != "" {
				_, _ = s.pool.Exec(ctx,
					`UPDATE calls SET sdp_answer = $2, call_status = 'connected', call_connected_at = now() WHERE id = $1`,
					callID, ce.Session.SDP)
				s.broadcastCallUpdate(ctx, orgID, callID, convID, "granted", "connected", ce.Session.SDP, "", 0)
			}

		case "terminate", "CALL_ENDED", "ended":
			_, _ = s.pool.Exec(ctx,
				`UPDATE calls SET
				   call_status = 'ended', call_ended_at = now(), end_reason = COALESCE($2, 'remote_hangup'),
				   duration_seconds = COALESCE(EXTRACT(EPOCH FROM (now() - call_connected_at))::int, 0),
				   sdp_offer = NULL, sdp_answer = NULL
				 WHERE id = $1`,
				callID, ce.Status)

			var dur int
			_ = s.pool.QueryRow(ctx, `SELECT duration_seconds FROM calls WHERE id=$1`, callID).Scan(&dur)
			s.broadcastCallUpdate(ctx, orgID, callID, convID, "", "ended", "", "remote_hangup", dur)
		}
	}
}

// broadcastCallUpdate publishes a call state change to NATS for the realtime WS layer.
func (s *server) broadcastCallUpdate(ctx context.Context, orgID, callID, convID, permStatus, callStatus, sdpAnswer, endReason string, dur int) {
	evt := events.CallUpdated{
		CallID:           callID,
		ConversationID:   convID,
		PermissionStatus: permStatus,
		CallStatus:       callStatus,
		SDPAnswer:        sdpAnswer,
		EndReason:        endReason,
		DurationSeconds:  dur,
	}
	if err := s.bus.Publish(events.SubjectCallUpdated, orgID, evt); err != nil {
		s.log.Error("publish call.updated failed", "err", err)
	}
}
