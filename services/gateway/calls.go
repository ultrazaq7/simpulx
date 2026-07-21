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

// callSummaryText renders the in-chat voice-call summary (always shown on end).
func callSummaryText(direction string, dur int) string {
	inbound := direction == "inbound"
	if dur > 0 {
		label := "Voice call"
		if inbound {
			label = "Incoming call"
		}
		return fmt.Sprintf("%s · %d:%02d", label, dur/60, dur%60)
	}
	if inbound {
		return "Missed call"
	}
	return "Voice call · No answer"
}

// insertCallSummary writes the voice-call entry as a dedicated type='call' message
// (rendered as a call bubble), aligned by direction.
func (s *server) insertCallSummary(ctx context.Context, orgID, convID, direction string, dur int) {
	s.insertCallMessage(ctx, orgID, convID, direction, callSummaryText(direction, dur))
}

// insertCallMessage persists a type='call' bubble AND broadcasts it over
// realtime immediately - without the publish, the bubble only appeared after a
// page reload (the "call result is delayed in chat" bug).
func (s *server) insertCallMessage(ctx context.Context, orgID, convID, direction, body string) {
	if convID == "" {
		return
	}
	if direction != "inbound" {
		direction = "outbound"
	}
	var msgID string
	if err := s.pool.QueryRow(ctx,
		`INSERT INTO messages (organization_id, conversation_id, direction, sender_type, type, body)
		 VALUES ($1, $2, $3, 'system', 'call', $4) RETURNING id::text`, orgID, convID, direction, body).Scan(&msgID); err != nil {
		s.log.Error("insert call summary failed", "conv", convID, "err", err)
		return
	}
	// Reflect the call as the conversation's last message in the inbox list.
	_, _ = s.pool.Exec(ctx,
		`UPDATE conversations SET last_message_at=now(), last_message_preview=LEFT($2,200), updated_at=now() WHERE id=$1`,
		convID, body)
	if err := s.bus.Publish(events.SubjectMessagePersisted, orgID, events.MessagePersisted{
		ConversationID: convID, MessageID: msgID, Direction: direction,
		SenderType: "system", Type: "call", Body: body, Preview: body,
	}); err != nil {
		s.log.Error("publish call bubble failed", "conv", convID, "err", err)
	}
}

// applyCallPermissionReply flips the pending outbound call when the customer
// replies to a call-permission request via an interactive message.
func (s *server) applyCallPermissionReply(ctx context.Context, orgID, fromPhone, response, repliedMsgID string) {
	r := strings.ToLower(response)
	// Match both English and Indonesian button labels: a customer on an
	// Indonesian WhatsApp replies "Izinkan"/"Tolak", which previously matched
	// neither branch, so the grant was silently dropped and the agent's call
	// screen sat on "Awaiting permission" forever.
	granted := strings.Contains(r, "accept") || strings.Contains(r, "allow") || strings.Contains(r, "grant") || strings.Contains(r, "approv") ||
		strings.Contains(r, "izin") || strings.Contains(r, "boleh") || strings.Contains(r, "setuju") || strings.Contains(r, "terima")
	denied := strings.Contains(r, "reject") || strings.Contains(r, "deny") || strings.Contains(r, "declin") ||
		strings.Contains(r, "tolak") || strings.Contains(r, "jangan") || strings.Contains(r, "tidak")
	// "terima" is a substring of nothing denied; but "tidak terima" contains both -> treat as denied.
	if granted && denied {
		granted = false
	}
	if !granted && !denied {
		return // unknown response — leave it as a displayed message only
	}
	var callID, convID string

	// Prefer exact match by the permission message wamid (multi-thread safe).
	if repliedMsgID != "" {
		err := s.pool.QueryRow(ctx,
			`SELECT id::text, conversation_id::text FROM calls
			  WHERE organization_id=$1 AND direction='outbound' AND permission_status='pending'
			    AND permission_msg_id=$2
			  ORDER BY created_at DESC LIMIT 1`,
			orgID, repliedMsgID).Scan(&callID, &convID)
		if err != nil {
			s.log.Warn("call permission reply: no match by msg_id, falling back to phone",
				"msg_id", repliedMsgID, "from", fromPhone)
		}
	}

	// Fallback: match by phone number (legacy / missing context).
	if callID == "" {
		err := s.pool.QueryRow(ctx,
			`SELECT id::text, conversation_id::text FROM calls
			  WHERE organization_id=$1 AND direction='outbound' AND permission_status='pending'
			    AND regexp_replace(contact_phone,'\D','','g') = regexp_replace($2,'\D','','g')
			  ORDER BY created_at DESC LIMIT 1`,
			orgID, fromPhone).Scan(&callID, &convID)
		if err != nil {
			return
		}
	}

	if granted {
		_, _ = s.pool.Exec(ctx, `UPDATE calls SET permission_status='granted', permission_granted_at=now() WHERE id=$1`, callID)
		s.broadcastCall(ctx, orgID, events.CallUpdated{
			CallID: callID, ConversationID: convID, Direction: "outbound",
			PermissionStatus: "granted", CallStatus: "idle",
		})
	} else {
		_, _ = s.pool.Exec(ctx, `UPDATE calls SET permission_status='denied', call_status='ended', end_reason='permission_denied' WHERE id=$1`, callID)
		s.broadcastCall(ctx, orgID, events.CallUpdated{
			CallID: callID, ConversationID: convID, Direction: "outbound",
			PermissionStatus: "denied", CallStatus: "ended", EndReason: "permission_denied",
		})
	}
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

	// If the customer already granted call permission recently, reuse it instead
	// of sending another request. Meta rate-limits permission requests (1/24h), but
	// a live grant lets the agent place the call right away. The new call row
	// inherits the original grant time so the validity window stays honest.
	var grantedAt time.Time
	hasGranted := s.pool.QueryRow(r.Context(),
		`SELECT permission_granted_at FROM calls
		  WHERE conversation_id = $1 AND permission_status = 'granted'
		    AND permission_granted_at > now() - interval '7 days'
		  ORDER BY permission_granted_at DESC LIMIT 1`,
		body.ConversationID,
	).Scan(&grantedAt) == nil
	if hasGranted {
		reuseID := uuid.NewString()
		if _, err = s.pool.Exec(r.Context(),
			`INSERT INTO calls (id, organization_id, conversation_id, channel_id, agent_id, contact_phone,
			                    direction, permission_status, call_status, permission_granted_at)
			 VALUES ($1,$2,$3,$4::uuid,$5::uuid,$6,'outbound','granted','idle',$7)`,
			reuseID, a.OrgID, body.ConversationID, channelID, a.UserID, contactPhone, grantedAt,
		); err != nil {
			s.log.Error("insert reused-permission call failed", "err", err)
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		s.broadcastCall(r.Context(), a.OrgID, events.CallUpdated{
			CallID: reuseID, ConversationID: body.ConversationID, Direction: "outbound",
			PermissionStatus: "granted", CallStatus: "idle",
		})
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"call_id": reuseID, "status": "granted"})
		return
	}

	// Rate limit: max 1 permission request per 24h per conversation.
	// Only count requests that are still pending/active — failed attempts
	// should not block retries (e.g. transient errors, 138017 before fix).
	var recentCount int
	_ = s.pool.QueryRow(r.Context(),
		`SELECT count(*) FROM calls
		  WHERE conversation_id = $1 AND permission_requested_at > now() - interval '24 hours'
		    AND call_status NOT IN ('failed', 'ended')`,
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
		// Meta error 138017: "A permanent permission has already been approved by
		// this consumer." Treat it as an implicit grant so the agent can call now.
		if strings.Contains(err.Error(), "138017") {
			s.log.Info("call permission already permanently granted by consumer, treating as granted",
				"conv", body.ConversationID, "phone", contactPhone)
			_, _ = s.pool.Exec(r.Context(),
				`UPDATE calls SET permission_status = 'granted', permission_granted_at = now(), call_status = 'idle' WHERE id = $1`, callID)
			s.broadcastCall(r.Context(), a.OrgID, events.CallUpdated{
				CallID: callID, ConversationID: body.ConversationID, Direction: "outbound",
				PermissionStatus: "granted", CallStatus: "idle",
			})
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]string{"call_id": callID, "status": "granted"})
			return
		}
		s.log.Error("send call permission failed", "err", err)
		_, _ = s.pool.Exec(r.Context(),
			`UPDATE calls SET call_status = 'failed', end_reason = $2 WHERE id = $1`, callID, err.Error())
		http.Error(w, "failed to send permission request: "+err.Error(), http.StatusUnprocessableEntity)
		return
	}

	_, _ = s.pool.Exec(r.Context(),
		`UPDATE calls SET permission_msg_id = $2 WHERE id = $1`, callID, wamid)

	_, _ = s.pool.Exec(r.Context(),
		`INSERT INTO messages (organization_id, conversation_id, direction, sender_type, type, body)
		 VALUES ($1, $2, 'outbound', 'system', 'text',
		         'Call permission request sent, awaiting customer approval')`,
		a.OrgID, body.ConversationID)

	s.broadcastCall(r.Context(), a.OrgID, events.CallUpdated{
		CallID: callID, ConversationID: body.ConversationID, Direction: "outbound",
		PermissionStatus: "pending", CallStatus: "requesting",
	})

	// An agent calling the customer is a human takeover just like replying: stand
	// the bot down so it can't keep chatting underneath a live call.
	s.standDownBot(r.Context(), a.OrgID, a.UserID, body.ConversationID)

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
			"action": map[string]any{"name": "call_permission_request"},
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
		http.Error(w, "call initiation failed: "+err.Error(), http.StatusUnprocessableEntity)
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
		http.Error(w, "call accept failed: "+err.Error(), http.StatusUnprocessableEntity)
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

// POST /api/calls/{id}/connected - the caller's device detected real inbound
// audio (actual pickup) on an outbound call. This is the authoritative start of
// talk time: the SDP-answer webhook fires at RING time, so trusting it counted
// ring seconds as call duration (a declined call showed "Voice call · 0:12").
func (s *server) handleCallConnected(w http.ResponseWriter, r *http.Request) {
	a := r.Context().Value(authCtxKey).(authInfo)
	callID := r.PathValue("id")
	var convID, direction string
	err := s.pool.QueryRow(r.Context(),
		`SELECT conversation_id::text, direction FROM calls WHERE id = $1 AND organization_id = $2`,
		callID, a.OrgID).Scan(&convID, &direction)
	if err != nil {
		http.Error(w, "call not found", http.StatusNotFound)
		return
	}
	tag, _ := s.pool.Exec(r.Context(),
		`UPDATE calls SET call_status = 'connected', call_connected_at = COALESCE(call_connected_at, now())
		  WHERE id = $1 AND call_status NOT IN ('ended','failed')`, callID)
	if tag.RowsAffected() > 0 {
		s.broadcastCall(r.Context(), a.OrgID, events.CallUpdated{
			CallID: callID, ConversationID: convID, Direction: direction,
			PermissionStatus: "granted", CallStatus: "connected",
		})
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "connected"})
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

	// WhatsApp parity: an unanswered inbound call is always "Missed call" in the
	// chat, whether it rang out or the agent declined (no "Declined call" bubble).
	s.insertCallSummary(r.Context(), a.OrgID, convID, "inbound", 0)

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
	s.insertCallSummary(r.Context(), a.OrgID, convID, direction, dur)

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
	// A call belongs to a conversation, so it inherits that conversation's campaign
	// scope. Without this an org check alone let a campaign-bound caller read the
	// call record (and its SDP) of any conversation in the org by id.
	args := []any{callID, a.OrgID}
	scope := ""
	if !orgWideCampaignView(a) {
		args = append(args, a.UserID)
		scope = fmt.Sprintf(` AND EXISTS (SELECT 1 FROM conversations cv
		                                   WHERE cv.id = calls.conversation_id AND %s)`,
			managerScope("cv", len(args)))
	}
	rows, err := s.queryMaps(r.Context(),
		`SELECT id::text, conversation_id::text, direction, permission_status, call_status,
		        external_call_id, duration_seconds, end_reason, created_at, sdp_offer
		   FROM calls WHERE id = $1 AND organization_id = $2`+scope,
		args...)
	if err != nil || len(rows) == 0 {
		http.Error(w, "call not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(rows[0])
}

// ── Save Call Recording ─────────────────────────────────────────────────────

// POST /api/calls/{id}/recording  Body: { "url": "..." }
// Stores the uploaded recording URL so the call can be downloaded later from Call Logs.
func (s *server) handleSaveCallRecording(w http.ResponseWriter, r *http.Request) {
	a := r.Context().Value(authCtxKey).(authInfo)
	callID := r.PathValue("id")
	var b struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil || b.URL == "" {
		http.Error(w, "url required", http.StatusBadRequest)
		return
	}
	ct, err := s.pool.Exec(r.Context(),
		`UPDATE calls SET recording_url = $1 WHERE id = $2 AND organization_id = $3`,
		b.URL, callID, a.OrgID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if ct.RowsAffected() == 0 {
		http.Error(w, "call not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"ok": true})
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
		// Permission grant/deny carries no call_context — match the most recent
		// pending outbound permission request for that customer's number.
		if callID == "" && strings.Contains(ce.Event, "permission") && ce.From != "" {
			_ = s.pool.QueryRow(ctx,
				`SELECT id::text FROM calls
				  WHERE organization_id=$1 AND direction='outbound' AND permission_status='pending'
				    AND regexp_replace(contact_phone,'\D','','g') = regexp_replace($2,'\D','','g')
				  ORDER BY created_at DESC LIMIT 1`,
				orgID, ce.From).Scan(&callID)
		}
		if callID == "" {
			s.log.Warn("call webhook: no matching call record", "ext_id", ce.ID, "event", ce.Event)
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
				`INSERT INTO messages (organization_id, conversation_id, direction, sender_type, type, body)
				 VALUES ($1, $2, 'inbound', 'system', 'text', 'Customer allowed the call')`,
				orgID, convID)

		case "permission_denied", "call_permission_denied":
			_, _ = s.pool.Exec(ctx,
				`UPDATE calls SET permission_status = 'denied', call_status = 'ended', end_reason = 'permission_denied' WHERE id = $1`, callID)
			s.broadcastCall(ctx, orgID, events.CallUpdated{
				CallID: callID, ConversationID: convID, Direction: "outbound",
				PermissionStatus: "denied", CallStatus: "ended", EndReason: "permission_denied",
			})

		case "connect":
			// Outbound: the SDP answer completes the WebRTC handshake, but WhatsApp
			// sends it while the callee is still RINGING - it is NOT pickup. Store
			// the answer and stay 'ringing'; the caller's device confirms actual
			// pickup via POST /api/calls/{id}/connected (audio detected), which is
			// what starts the billed/summary duration. Without this, a declined
			// call counted its ring time as an answered call.
			if ce.Session.SDPType == "answer" && ce.Session.SDP != "" {
				_, _ = s.pool.Exec(ctx,
					`UPDATE calls SET sdp_answer = $2, call_status = 'ringing' WHERE id = $1 AND call_status NOT IN ('connected','ended','failed')`,
					callID, ce.Session.SDP)
				s.broadcastCall(ctx, orgID, events.CallUpdated{
					CallID: callID, ConversationID: convID, Direction: "outbound",
					PermissionStatus: "granted", CallStatus: "ringing", SDPAnswer: ce.Session.SDP,
				})
			}

		case "terminate", "CALL_ENDED", "ended",
			// Callee declined / line busy / ring timeout: Meta reports these as
			// their own events on some payload versions. Without handling them the
			// caller's screen kept "Ringing..." forever after a decline.
			"reject", "rejected", "REJECTED", "decline", "declined", "busy", "BUSY", "timeout", "no_answer":
			// Skip the summary message if the agent already ended it (avoids a
			// duplicate when our own hangup triggers Meta's terminate webhook).
			var alreadyEnded, wasConnected bool
			var callDir string
			_ = s.pool.QueryRow(ctx, `SELECT call_status='ended', direction, call_connected_at IS NOT NULL FROM calls WHERE id=$1`, callID).Scan(&alreadyEnded, &callDir, &wasConnected)
			// Prefer Meta's authoritative duration; fall back to connected_at.
			// A call that was never confirmed connected (no pickup) has duration 0
			// no matter what - ring time must never count as talk time.
			dur := ce.Duration
			if !wasConnected {
				dur = 0
			}
			// Reason: Meta's status when present, else the event name itself
			// (reject/busy/...), else generic remote_hangup.
			reason := ce.Status
			if reason == "" && ce.Event != "terminate" && ce.Event != "CALL_ENDED" && ce.Event != "ended" {
				reason = ce.Event
			}
			if dur > 0 {
				_, _ = s.pool.Exec(ctx,
					`UPDATE calls SET call_status='ended', call_ended_at=now(),
					   end_reason=COALESCE(NULLIF($2,''),'remote_hangup'), duration_seconds=$3,
					   sdp_offer=NULL, sdp_answer=NULL WHERE id=$1`,
					callID, reason, dur)
			} else {
				_, _ = s.pool.Exec(ctx,
					`UPDATE calls SET call_status='ended', call_ended_at=now(),
					   end_reason=COALESCE(NULLIF($2,''),'remote_hangup'),
					   duration_seconds=CASE WHEN call_connected_at IS NULL THEN 0
					     ELSE COALESCE(EXTRACT(EPOCH FROM (now() - call_connected_at))::int, 0) END,
					   sdp_offer=NULL, sdp_answer=NULL WHERE id=$1`,
					callID, reason)
				_ = s.pool.QueryRow(ctx, `SELECT duration_seconds FROM calls WHERE id=$1`, callID).Scan(&dur)
			}
			s.persistCallDuration(ctx, convID, dur)
			if !alreadyEnded {
				// Only surface the summary + broadcast (and thus the FCM push) when
				// the REMOTE actually ended the call. If we already ended it (agent
				// reject/hangup), our own handler already broadcast + pushed the
				// correct state; re-broadcasting here fires a duplicate "Missed call"
				// with a ringtone, because Meta's terminate webhook trails our own
				// reject/hangup for the same call.
				s.insertCallSummary(ctx, orgID, convID, callDir, dur)
				s.broadcastCall(ctx, orgID, events.CallUpdated{
					CallID: callID, ConversationID: convID, Direction: callDir,
					CallStatus: "ended", EndReason: "remote_hangup", DurationSeconds: dur,
				})
			}
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

	// No "Incoming WhatsApp call" text message here: the call summary card
	// (insertCallSummary, on end) is the single canonical thread event for a call,
	// so inserting this too would duplicate every call in the timeline.

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
