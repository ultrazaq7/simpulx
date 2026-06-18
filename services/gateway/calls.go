package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/simpulx/v2/libs/go/config"
	"github.com/simpulx/v2/libs/go/events"
)

// ── WhatsApp Business Calling API (both directions) ─────────────────────────
//
// OUTBOUND (business-initiated, agent calls customer):
//  1. Agent clicks Call → POST /api/calls/request-permission
//     Gateway sends a call-permission request to the customer.
//  2. Customer taps Allow → webhook permission_granted
//     Gateway updates DB + broadcasts events.call.updated via NATS/WS.
//  3. Agent clicks Call Now → POST /api/calls/initiate { call_id, sdp_offer }
//     Gateway forwards the SDP offer to POST /{phone}/calls (action: connect).
//  4. Customer accepts on phone → webhook connect carries the SDP answer →
//     gateway broadcasts it → browser completes the WebRTC peer connection.
//
// INBOUND (user-initiated, customer calls the business number):
//  1. Webhook connect (direction USER_INITIATED) carries the customer's SDP
//     offer. Gateway finds the conversation, creates an inbound call record and
//     rings the conversation's ASSIGNED agent (broadcast carries agent_id +
//     offer). If unassigned, every agent's browser rings and first-to-answer wins.
//  2. Agent clicks Accept → browser builds an SDP answer → POST /api/calls/{id}/accept.
//     Gateway forwards it to Meta (action: accept). Reject → action: reject.

var graphBase = config.Get("WA_GRAPH_BASE", "https://graph.facebook.com/v21.0")

// broadcastCall publishes a call state change to NATS for the realtime WS layer.
func (s *server) broadcastCall(ctx context.Context, orgID string, evt events.CallUpdated) {
	if err := s.bus.Publish(events.SubjectCallUpdated, orgID, evt); err != nil {
		s.log.Error("publish call.updated failed", "err", err)
	}
}

func (s *server) callConvID(ctx context.Context, callID string) string {
	var convID string
	_ = s.pool.QueryRow(ctx, `SELECT conversation_id::text FROM calls WHERE id=$1`, callID).Scan(&convID)
	return convID
}

// ── Request Call Permission (outbound) ──────────────────────────────────────

// POST /api/calls/request-permission   Body: { "conversation_id": "..." }
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
		`SELECT ch.id::text, ch.phone_number_id, ch.access_token, ct.phone
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

	// Rate limit: max 1 permission request per 24h per conversation.
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

	callID := uuid.NewString()
	now := time.Now()
	_, err = s.pool.Exec(r.Context(),
		`INSERT INTO calls (id, organization_id, conversation_id, channel_id, agent_id, contact_phone,
		                    direction, permission_status, call_status, permission_requested_at)
		 VALUES ($1,$2,$3,$4::uuid,$5::uuid,$6,'outbound','pending','requesting',$7)`,
		callID, a.OrgID, body.ConversationID, channelID, a.UserID, contactPhone, now,
	)
	if err != nil {
		s.log.Error("insert call failed", "err", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	wamid, err := s.sendCallPermissionRequest(r.Context(), phoneNumberID, accessToken, contactPhone, callID)
	if err != nil {
		s.log.Error("send call permission failed", "err", err)
		_, _ = s.pool.Exec(r.Context(),
			`UPDATE calls SET call_status = 'failed', end_reason = $2 WHERE id = $1`, callID, err.Error())
		http.Error(w, "failed to send permission request: "+err.Error(), http.StatusBadGateway)
		return
	}

	_, _ = s.pool.Exec(r.Context(),
		`UPDATE calls SET permission_msg_id = $2 WHERE id = $1`, callID, wamid)

	_, _ = s.pool.Exec(r.Context(),
		`INSERT INTO messages (organization_id, conversation_id, direction, sender_type, type, body, preview)
		 VALUES ($1, $2, 'outbound', 'system', 'text',
		         '📞 Business call request sent — Awaiting customer approval', '📞 Call request sent')`,
		a.OrgID, body.ConversationID)

	s.broadcastCall(r.Context(), a.OrgID, events.CallUpdated{
		CallID: callID, ConversationID: body.ConversationID, Direction: "outbound",
		PermissionStatus: "pending", CallStatus: "requesting",
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"call_id": callID, "status": "requesting"})
}

// sendCallPermissionRequest sends an interactive call-permission request.
func (s *server) sendCallPermissionRequest(ctx context.Context, phoneNumberID, token, to, callID string) (string, error) {
	if config.GetBool("WA_MOCK", true) || token == "" {
		return "wamid.MOCK-CPR-" + callID[:8], nil
	}
	payload := map[string]any{
		"messaging_product": "whatsapp",
		"to":                to,
		"type":              "interactive",
		"interactive": map[string]any{
			"type": "call_permission_request",
			"body": map[string]string{
				"text": "Kami ingin menghubungi Anda melalui WhatsApp. Apakah Anda bersedia menerima panggilan?",
			},
			"action": map[string]any{
				"name":       "call_permission_request",
				"parameters": map[string]any{"call_context": callID},
			},
		},
	}
	respBody, err := s.metaPost(ctx, fmt.Sprintf("%s/%s/messages", graphBase, phoneNumberID), token, payload)
	if err != nil {
		return "", err
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

// ── Initiate Call (outbound) ────────────────────────────────────────────────

// POST /api/calls/initiate   Body: { "call_id": "...", "sdp_offer": "..." }
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

	var phoneNumberID, accessToken, contactPhone, permStatus string
	err := s.pool.QueryRow(r.Context(),
		`SELECT ch.phone_number_id, ch.access_token, c.contact_phone, c.permission_status
		   FROM calls c JOIN channels ch ON ch.id = c.channel_id
		  WHERE c.id = $1 AND c.organization_id = $2`,
		body.CallID, a.OrgID,
	).Scan(&phoneNumberID, &accessToken, &contactPhone, &permStatus)
	if err != nil {
		http.Error(w, "call not found", http.StatusNotFound)
		return
	}
	if permStatus != "granted" {
		http.Error(w, "call permission not yet granted (status: "+permStatus+")", http.StatusConflict)
		return
	}

	_, _ = s.pool.Exec(r.Context(),
		`UPDATE calls SET sdp_offer = $2, call_status = 'ringing', call_initiated_at = now() WHERE id = $1`,
		body.CallID, body.SDPOffer)

	extCallID, err := s.postMetaCallInitiate(r.Context(), phoneNumberID, accessToken, contactPhone, body.SDPOffer, body.CallID)
	convID := s.callConvID(r.Context(), body.CallID)
	if err != nil {
		s.log.Error("meta call initiate failed", "err", err)
		_, _ = s.pool.Exec(r.Context(),
			`UPDATE calls SET call_status = 'failed', end_reason = $2 WHERE id = $1`, body.CallID, err.Error())
		s.broadcastCall(r.Context(), a.OrgID, events.CallUpdated{
			CallID: body.CallID, ConversationID: convID, Direction: "outbound",
			PermissionStatus: "granted", CallStatus: "failed", EndReason: err.Error(),
		})
		http.Error(w, "call initiation failed: "+err.Error(), http.StatusBadGateway)
		return
	}

	_, _ = s.pool.Exec(r.Context(),
		`UPDATE calls SET external_call_id = $2 WHERE id = $1`, body.CallID, extCallID)
	s.broadcastCall(r.Context(), a.OrgID, events.CallUpdated{
		CallID: body.CallID, ConversationID: convID, Direction: "outbound",
		PermissionStatus: "granted", CallStatus: "ringing",
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"call_id": body.CallID, "external_call_id": extCallID, "status": "ringing",
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
		"session":           map[string]string{"sdp_type": "offer", "sdp": sdpOffer},
	}
	respBody, err := s.metaPost(ctx, fmt.Sprintf("%s/%s/calls", graphBase, phoneNumberID), token, payload)
	if err != nil {
		return "", err
	}
	var out struct {
		ID    string `json:"id"`
		Calls []struct {
			ID string `json:"id"`
		} `json:"calls"`
	}
	_ = json.Unmarshal(respBody, &out)
	if out.ID != "" {
		return out.ID, nil
	}
	if len(out.Calls) > 0 {
		return out.Calls[0].ID, nil
	}
	return "", nil
}

// ── Accept / Reject (inbound) ───────────────────────────────────────────────

// POST /api/calls/{id}/accept   Body: { "sdp_answer": "..." }
func (s *server) handleAcceptCall(w http.ResponseWriter, r *http.Request) {
	a := r.Context().Value(authCtxKey).(authInfo)
	callID := r.PathValue("id")
	var body struct {
		SDPAnswer string `json:"sdp_answer"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.SDPAnswer == "" {
		http.Error(w, "sdp_answer required", http.StatusBadRequest)
		return
	}

	var convID, extCallID, phoneNumberID, accessToken, direction string
	err := s.pool.QueryRow(r.Context(),
		`SELECT c.conversation_id::text, COALESCE(c.external_call_id,''), ch.phone_number_id, ch.access_token, c.direction
		   FROM calls c JOIN channels ch ON ch.id = c.channel_id
		  WHERE c.id = $1 AND c.organization_id = $2`,
		callID, a.OrgID,
	).Scan(&convID, &extCallID, &phoneNumberID, &accessToken, &direction)
	if err != nil {
		http.Error(w, "call not found", http.StatusNotFound)
		return
	}
	if direction != "inbound" {
		http.Error(w, "not an inbound call", http.StatusBadRequest)
		return
	}

	// Atomically claim the call: only the first accept (while still 'incoming')
	// wins, so a shared/unassigned inbound call can't be double-answered.
	tag, _ := s.pool.Exec(r.Context(),
		`UPDATE calls SET call_status = 'connecting', agent_id = $3::uuid, sdp_answer = $2
		  WHERE id = $1 AND call_status = 'incoming'`,
		callID, body.SDPAnswer, a.UserID)
	if tag.RowsAffected() == 0 {
		http.Error(w, "call already answered or no longer ringing", http.StatusConflict)
		return
	}

	if err := s.postMetaCallAcceptReject(r.Context(), phoneNumberID, accessToken, extCallID, "accept", body.SDPAnswer); err != nil {
		s.log.Error("meta call accept failed", "err", err)
		_, _ = s.pool.Exec(r.Context(),
			`UPDATE calls SET call_status = 'failed', end_reason = $2 WHERE id = $1`, callID, err.Error())
		s.broadcastCall(r.Context(), a.OrgID, events.CallUpdated{
			CallID: callID, ConversationID: convID, Direction: "inbound",
			CallStatus: "failed", EndReason: err.Error(),
		})
		http.Error(w, "call accept failed: "+err.Error(), http.StatusBadGateway)
		return
	}

	_, _ = s.pool.Exec(r.Context(),
		`UPDATE calls SET call_status = 'connected', call_connected_at = now() WHERE id = $1`, callID)
	s.broadcastCall(r.Context(), a.OrgID, events.CallUpdated{
		CallID: callID, ConversationID: convID, Direction: "inbound",
		AgentID: a.UserID, CallStatus: "connected",
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"call_id": callID, "status": "connected"})
}

// POST /api/calls/{id}/reject
func (s *server) handleRejectCall(w http.ResponseWriter, r *http.Request) {
	a := r.Context().Value(authCtxKey).(authInfo)
	callID := r.PathValue("id")

	var convID, extCallID, phoneNumberID, accessToken, direction string
	err := s.pool.QueryRow(r.Context(),
		`SELECT c.conversation_id::text, COALESCE(c.external_call_id,''), ch.phone_number_id, ch.access_token, c.direction
		   FROM calls c JOIN channels ch ON ch.id = c.channel_id
		  WHERE c.id = $1 AND c.organization_id = $2`,
		callID, a.OrgID,
	).Scan(&convID, &extCallID, &phoneNumberID, &accessToken, &direction)
	if err != nil {
		http.Error(w, "call not found", http.StatusNotFound)
		return
	}

	tag, _ := s.pool.Exec(r.Context(),
		`UPDATE calls SET call_status = 'ended', call_ended_at = now(), end_reason = 'rejected'
		  WHERE id = $1 AND call_status = 'incoming'`, callID)
	if tag.RowsAffected() == 0 {
		http.Error(w, "call no longer ringing", http.StatusConflict)
		return
	}

	if extCallID != "" {
		_ = s.postMetaCallAcceptReject(r.Context(), phoneNumberID, accessToken, extCallID, "reject", "")
	}

	_, _ = s.pool.Exec(r.Context(),
		`INSERT INTO messages (organization_id, conversation_id, direction, sender_type, type, body, preview)
		 VALUES ($1, $2, 'inbound', 'system', 'text', '📞 Missed / declined call', '📞 Call declined')`,
		a.OrgID, convID)

	s.broadcastCall(r.Context(), a.OrgID, events.CallUpdated{
		CallID: callID, ConversationID: convID, Direction: "inbound",
		CallStatus: "ended", EndReason: "rejected",
	})
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ended"})
}

// postMetaCallAcceptReject answers (with SDP) or rejects an inbound call.
func (s *server) postMetaCallAcceptReject(ctx context.Context, phoneNumberID, token, extCallID, action, sdpAnswer string) error {
	if config.GetBool("WA_MOCK", true) || token == "" {
		return nil
	}
	payload := map[string]any{
		"messaging_product": "whatsapp",
		"call_id":           extCallID,
		"action":            action,
	}
	if action == "accept" {
		payload["session"] = map[string]string{"sdp_type": "answer", "sdp": sdpAnswer}
	}
	_, err := s.metaPost(ctx, fmt.Sprintf("%s/%s/calls", graphBase, phoneNumberID), token, payload)
	return err
}

// ── End Call (both directions) ──────────────────────────────────────────────

// POST /api/calls/{id}/end
func (s *server) handleEndCall(w http.ResponseWriter, r *http.Request) {
	a := r.Context().Value(authCtxKey).(authInfo)
	callID := r.PathValue("id")

	var convID, extCallID, phoneNumberID, accessToken, callStatus, direction string
	err := s.pool.QueryRow(r.Context(),
		`SELECT c.conversation_id::text, COALESCE(c.external_call_id,''), ch.phone_number_id, ch.access_token, c.call_status, c.direction
		   FROM calls c JOIN channels ch ON ch.id = c.channel_id
		  WHERE c.id = $1 AND c.organization_id = $2`,
		callID, a.OrgID,
	).Scan(&convID, &extCallID, &phoneNumberID, &accessToken, &callStatus, &direction)
	if err != nil {
		http.Error(w, "call not found", http.StatusNotFound)
		return
	}

	if extCallID != "" && (callStatus == "ringing" || callStatus == "connected" || callStatus == "connecting") {
		_ = s.postMetaCallTerminate(r.Context(), phoneNumberID, accessToken, extCallID)
	}

	_, _ = s.pool.Exec(r.Context(),
		`UPDATE calls SET
		   call_status = 'ended', call_ended_at = now(), end_reason = 'agent_hangup',
		   duration_seconds = COALESCE(EXTRACT(EPOCH FROM (now() - call_connected_at))::int, 0),
		   sdp_offer = NULL, sdp_answer = NULL
		 WHERE id = $1`, callID)

	var dur int
	_ = s.pool.QueryRow(r.Context(), `SELECT duration_seconds FROM calls WHERE id=$1`, callID).Scan(&dur)
	s.persistCallDuration(r.Context(), convID, dur)

	if dur > 0 {
		_, _ = s.pool.Exec(r.Context(),
			`INSERT INTO messages (organization_id, conversation_id, direction, sender_type, type, body, preview)
			 VALUES ($1, $2, 'outbound', 'system', 'text', $3, $3)`,
			a.OrgID, convID, fmt.Sprintf("📞 Voice call ended — %d:%02d", dur/60, dur%60))
	}

	s.broadcastCall(r.Context(), a.OrgID, events.CallUpdated{
		CallID: callID, ConversationID: convID, Direction: direction,
		CallStatus: "ended", EndReason: "agent_hangup", DurationSeconds: dur,
	})
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
		"call_id":           extCallID,
		"action":            "terminate",
	}
	_, err := s.metaPost(ctx, fmt.Sprintf("%s/%s/calls", graphBase, phoneNumberID), token, payload)
	return err
}

// ── Get Call ────────────────────────────────────────────────────────────────

// GET /api/calls/{id}
func (s *server) handleGetCall(w http.ResponseWriter, r *http.Request) {
	a := r.Context().Value(authCtxKey).(authInfo)
	callID := r.PathValue("id")
	rows, err := s.queryMaps(r.Context(),
		`SELECT id::text, conversation_id::text, direction, permission_status, call_status,
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

type callWebhookEvent struct {
	ID        string `json:"id"`
	Event     string `json:"event"`
	Direction string `json:"direction"` // USER_INITIATED | BUSINESS_INITIATED
	From      string `json:"from"`
	To        string `json:"to"`
	Status    string `json:"status"`
	Duration  int    `json:"duration"`
	Session   struct {
		SDPType string `json:"sdp_type"`
		SDP     string `json:"sdp"`
	} `json:"session"`
	Context struct {
		CallContext string `json:"call_context"` // our internal call_id (outbound)
	} `json:"context"`
}

// processCallWebhook handles the "calls" field from Meta webhooks for both
// directions. phoneNumberID identifies the channel (needed to route inbound calls).
func (s *server) processCallWebhook(ctx context.Context, orgID, phoneNumberID string, rawCalls json.RawMessage) {
	var callEvents []callWebhookEvent
	if err := json.Unmarshal(rawCalls, &callEvents); err != nil {
		s.log.Warn("decode call webhook failed", "err", err)
		return
	}

	for _, ce := range callEvents {
		s.log.Info("call webhook event", "event", ce.Event, "dir", ce.Direction,
			"status", ce.Status, "call_ctx", ce.Context.CallContext, "ext_id", ce.ID)

		// Resolve our internal call record (outbound has call_context; any prior
		// record matches by external_call_id).
		callID := ce.Context.CallContext
		if callID == "" {
			_ = s.pool.QueryRow(ctx,
				`SELECT id::text FROM calls WHERE external_call_id = $1 AND organization_id = $2`,
				ce.ID, orgID).Scan(&callID)
		}

		// INBOUND: a brand-new user-initiated call has no record yet.
		isInboundConnect := ce.Event == "connect" &&
			(strings.EqualFold(ce.Direction, "USER_INITIATED") || ce.Session.SDPType == "offer")
		if callID == "" && isInboundConnect {
			s.handleInboundCall(ctx, orgID, phoneNumberID, ce)
			continue
		}
		if callID == "" {
			s.log.Warn("call webhook: no matching call record", "ext_id", ce.ID)
			continue
		}

		convID := s.callConvID(ctx, callID)

		switch ce.Event {
		case "permission_granted", "call_permission_granted":
			_, _ = s.pool.Exec(ctx,
				`UPDATE calls SET permission_status = 'granted', permission_granted_at = now() WHERE id = $1`, callID)
			s.broadcastCall(ctx, orgID, events.CallUpdated{
				CallID: callID, ConversationID: convID, Direction: "outbound",
				PermissionStatus: "granted", CallStatus: "idle",
			})
			_, _ = s.pool.Exec(ctx,
				`INSERT INTO messages (organization_id, conversation_id, direction, sender_type, type, body, preview)
				 VALUES ($1, $2, 'inbound', 'system', 'text', '✅ Customer approved call request', '✅ Call approved')`,
				orgID, convID)

		case "permission_denied", "call_permission_denied":
			_, _ = s.pool.Exec(ctx,
				`UPDATE calls SET permission_status = 'denied', call_status = 'ended', end_reason = 'permission_denied' WHERE id = $1`, callID)
			s.broadcastCall(ctx, orgID, events.CallUpdated{
				CallID: callID, ConversationID: convID, Direction: "outbound",
				PermissionStatus: "denied", CallStatus: "ended", EndReason: "permission_denied",
			})

		case "connect":
			// Outbound: the SDP answer from the customer completes the handshake.
			if ce.Session.SDPType == "answer" && ce.Session.SDP != "" {
				_, _ = s.pool.Exec(ctx,
					`UPDATE calls SET sdp_answer = $2, call_status = 'connected', call_connected_at = now() WHERE id = $1`,
					callID, ce.Session.SDP)
				s.broadcastCall(ctx, orgID, events.CallUpdated{
					CallID: callID, ConversationID: convID, Direction: "outbound",
					PermissionStatus: "granted", CallStatus: "connected", SDPAnswer: ce.Session.SDP,
				})
			}

		case "terminate", "CALL_ENDED", "ended":
			// Prefer Meta's authoritative duration; fall back to connected_at.
			dur := ce.Duration
			if dur > 0 {
				_, _ = s.pool.Exec(ctx,
					`UPDATE calls SET call_status='ended', call_ended_at=now(),
					   end_reason=COALESCE(NULLIF($2,''),'remote_hangup'), duration_seconds=$3,
					   sdp_offer=NULL, sdp_answer=NULL WHERE id=$1`,
					callID, ce.Status, dur)
			} else {
				_, _ = s.pool.Exec(ctx,
					`UPDATE calls SET call_status='ended', call_ended_at=now(),
					   end_reason=COALESCE(NULLIF($2,''),'remote_hangup'),
					   duration_seconds=COALESCE(EXTRACT(EPOCH FROM (now() - call_connected_at))::int, 0),
					   sdp_offer=NULL, sdp_answer=NULL WHERE id=$1`,
					callID, ce.Status)
				_ = s.pool.QueryRow(ctx, `SELECT duration_seconds FROM calls WHERE id=$1`, callID).Scan(&dur)
			}
			s.persistCallDuration(ctx, convID, dur)
			s.broadcastCall(ctx, orgID, events.CallUpdated{
				CallID: callID, ConversationID: convID,
				CallStatus: "ended", EndReason: "remote_hangup", DurationSeconds: dur,
			})
		}
	}
}

// handleInboundCall creates a record for a user-initiated call and rings the
// conversation's assigned agent (or every agent when unassigned).
func (s *server) handleInboundCall(ctx context.Context, orgID, phoneNumberID string, ce callWebhookEvent) {
	var convID, channelID, contactName, assignedAgent string
	err := s.pool.QueryRow(ctx,
		`SELECT cv.id::text, cv.channel_id::text, COALESCE(ct.full_name,''), COALESCE(cv.assigned_agent_id::text,'')
		   FROM channels ch
		   JOIN contacts ct ON ct.organization_id = ch.organization_id
		     AND regexp_replace(ct.phone,'\D','','g') = regexp_replace($2,'\D','','g')
		   JOIN conversations cv ON cv.contact_id = ct.id AND cv.channel_id = ch.id
		  WHERE ch.phone_number_id = $1
		  ORDER BY cv.last_message_at DESC NULLS LAST
		  LIMIT 1`,
		phoneNumberID, ce.From,
	).Scan(&convID, &channelID, &contactName, &assignedAgent)
	if err != nil {
		s.log.Warn("inbound call: no conversation for caller, ignoring", "from", ce.From, "err", err)
		return
	}

	callID := uuid.NewString()
	_, err = s.pool.Exec(ctx,
		`INSERT INTO calls (id, organization_id, conversation_id, channel_id, agent_id, contact_phone,
		                    direction, permission_status, call_status, external_call_id, sdp_offer, call_initiated_at)
		 VALUES ($1,$2,$3,$4,NULLIF($5,'')::uuid,$6,'inbound','granted','incoming',$7,$8,now())`,
		callID, orgID, convID, channelID, assignedAgent, ce.From, ce.ID, ce.Session.SDP)
	if err != nil {
		s.log.Error("insert inbound call failed", "err", err)
		return
	}

	_, _ = s.pool.Exec(ctx,
		`INSERT INTO messages (organization_id, conversation_id, direction, sender_type, type, body, preview)
		 VALUES ($1, $2, 'inbound', 'contact', 'text', '📞 Incoming WhatsApp call', '📞 Incoming call')`,
		orgID, convID)

	s.broadcastCall(ctx, orgID, events.CallUpdated{
		CallID: callID, ConversationID: convID, Direction: "inbound",
		AgentID: assignedAgent, ContactName: contactName, ContactPhone: ce.From,
		PermissionStatus: "granted", CallStatus: "incoming", SDPOffer: ce.Session.SDP,
	})
	s.log.Info("inbound call ringing", "conv", convID, "agent", assignedAgent, "from", ce.From)
}

// persistCallDuration rolls the completed call's duration into the conversation
// aggregates so analytics / SLA see real talk time (call_attempts + total).
func (s *server) persistCallDuration(ctx context.Context, convID string, dur int) {
	if convID == "" {
		return
	}
	_, _ = s.pool.Exec(ctx,
		`UPDATE conversations
		    SET call_attempts = COALESCE(call_attempts,0) + 1,
		        total_call_duration = COALESCE(total_call_duration,0) + $2
		  WHERE id = $1`, convID, dur)
}

// metaPost is a small helper for authenticated Graph API POSTs.
func (s *server) metaPost(ctx context.Context, url, token string, payload any) ([]byte, error) {
	buf, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(buf))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("meta API error %d: %s", resp.StatusCode, string(respBody))
	}
	return respBody, nil
}
