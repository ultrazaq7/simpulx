package main

// ── Automation executor ─────────────────────────────────────
// Evaluates active automations on each inbound message and runs the matching
// ones. These are deterministic, user-configured rules (NOT the AI assistant) —
// keyword auto-reply, auto-tag, auto-assign, etc. Best-effort: it never blocks
// or fails ingest.
//
// Supported triggers: new_message, keyword_match, new_conversation.
// Supported actions: send_message, add_tag, remove_tag, assign_agent,
// close_conversation, webhook_notify. (send_template / assign_team / set_priority
// are recognised but not yet executed.)

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/simpulx/v2/libs/go/events"
)

type autoRule struct {
	ID            string
	TriggerType   string
	TriggerConfig []byte
	Actions       []byte
	Flow          []byte
}

type autoNode struct {
	ID     string         `json:"id"`
	Type   string         `json:"type"`
	Config map[string]any `json:"config"`
}
type autoEdge struct {
	From string `json:"from"`
	To   string `json:"to"`
}
type autoFlow struct {
	Nodes []autoNode `json:"nodes"`
	Edges []autoEdge `json:"edges"`
}
type autoStep struct {
	Type   string
	Params map[string]any
}

// runAutomations loads active automations for the org/channel and fires the
// ones whose trigger matches this inbound message. payload is the tapped button
// callback id (empty for normal messages).
func (a *app) runAutomations(ctx context.Context, orgID, convID, contactID, channelID, body, payload string) {
	rules, err := a.st.activeAutomations(ctx, orgID, channelID)
	if err != nil {
		a.log.Warn("load automations failed", "err", err)
		return
	}
	if len(rules) == 0 {
		return
	}
	// Only pay for the "is this the first message" check when a new_conversation
	// rule actually exists.
	isNew := false
	for _, r := range rules {
		if r.TriggerType == "new_conversation" {
			isNew = a.st.isFirstInbound(ctx, convID)
			break
		}
	}
	for _, r := range rules {
		if !triggerMatches(r, body, payload, isNew) {
			continue
		}
		steps := flowSteps(r)
		for _, s := range steps {
			a.execStep(ctx, orgID, convID, contactID, s)
		}
		_ = a.st.bumpAutomationRun(ctx, r.ID)
		a.log.Info("automation fired", "id", r.ID, "trigger", r.TriggerType, "steps", len(steps))
	}
}

func triggerMatches(r autoRule, body, payload string, isNew bool) bool {
	switch r.TriggerType {
	case "new_message":
		return true
	case "new_conversation":
		return isNew
	case "keyword_match":
		var cfg struct {
			Keywords []string `json:"keywords"`
		}
		_ = json.Unmarshal(r.TriggerConfig, &cfg)
		lb := strings.ToLower(body)
		for _, k := range cfg.Keywords {
			k = strings.ToLower(strings.TrimSpace(k))
			if k != "" && strings.Contains(lb, k) {
				return true
			}
		}
	case "button_click":
		// Fires when the contact tapped a quick-reply / template button. An
		// optional `callback` in trigger_config narrows it to a specific callback
		// id (substring match, e.g. a broadcast key or button suffix like ".daftar").
		if payload == "" {
			return false
		}
		var cfg struct {
			Callback string `json:"callback"`
		}
		_ = json.Unmarshal(r.TriggerConfig, &cfg)
		cb := strings.ToLower(strings.TrimSpace(cfg.Callback))
		return cb == "" || strings.Contains(strings.ToLower(payload), cb)
	}
	return false
}

// flowSteps returns the ordered action steps. It prefers the visual flow (walked
// from the trigger node along edges), falling back to the legacy actions[] array.
func flowSteps(r autoRule) []autoStep {
	var f autoFlow
	if len(r.Flow) > 0 {
		_ = json.Unmarshal(r.Flow, &f)
	}
	if len(f.Nodes) > 0 {
		byID := make(map[string]autoNode, len(f.Nodes))
		var triggerID string
		for _, n := range f.Nodes {
			byID[n.ID] = n
			if n.Type == "trigger" {
				triggerID = n.ID
			}
		}
		next := make(map[string]string, len(f.Edges))
		for _, e := range f.Edges {
			next[e.From] = e.To
		}
		var out []autoStep
		if triggerID == "" {
			for _, n := range f.Nodes {
				if n.Type == "trigger" || n.Type == "condition" {
					continue
				}
				out = append(out, autoStep{Type: n.Type, Params: n.Config})
			}
			return out
		}
		seen := map[string]bool{}
		for cur := next[triggerID]; cur != "" && !seen[cur]; cur = next[cur] {
			seen[cur] = true
			n := byID[cur]
			if n.Type != "trigger" && n.Type != "condition" {
				out = append(out, autoStep{Type: n.Type, Params: n.Config})
			}
		}
		return out
	}
	// Legacy single-action array.
	var acts []struct {
		Type   string         `json:"type"`
		Params map[string]any `json:"params"`
	}
	if len(r.Actions) > 0 {
		_ = json.Unmarshal(r.Actions, &acts)
	}
	out := make([]autoStep, 0, len(acts))
	for _, ac := range acts {
		out = append(out, autoStep{Type: ac.Type, Params: ac.Params})
	}
	return out
}

func (a *app) execStep(ctx context.Context, orgID, convID, contactID string, s autoStep) {
	switch s.Type {
	case "send_message":
		msg := pStr(s.Params, "message")
		if msg == "" {
			return
		}
		_ = a.bus.Publish(events.SubjectMessageOutbound, orgID, events.MessageOutbound{
			ConversationID: convID, SenderType: "system", Type: "text", Body: msg,
		})
	case "add_tag":
		if tags := pStrSlice(s.Params, "tags"); len(tags) > 0 {
			if err := a.st.addContactTags(ctx, contactID, tags); err != nil {
				a.log.Warn("automation add_tag failed", "err", err)
			}
		}
	case "remove_tag":
		if tags := pStrSlice(s.Params, "tags"); len(tags) > 0 {
			if err := a.st.removeContactTags(ctx, contactID, tags); err != nil {
				a.log.Warn("automation remove_tag failed", "err", err)
			}
		}
	case "assign_agent":
		agentID := pStr(s.Params, "agent_id")
		if agentID == "" {
			agentID = a.st.resolveAgentByName(ctx, orgID, pStr(s.Params, "agent_name"))
		}
		if agentID != "" {
			if err := a.st.assignConversation(ctx, convID, agentID); err != nil {
				a.log.Warn("automation assign_agent failed", "err", err)
			}
		}
	case "close_conversation":
		if err := a.st.closeConversation(ctx, convID); err != nil {
			a.log.Warn("automation close_conversation failed", "err", err)
		}
	case "webhook_notify":
		if url := pStr(s.Params, "url"); url != "" {
			go postWebhook(url, orgID, convID)
		}
	default:
		a.log.Info("automation action not yet supported", "type", s.Type)
	}
}

// ── param helpers ──
func pStr(m map[string]any, k string) string {
	if v, ok := m[k].(string); ok {
		return strings.TrimSpace(v)
	}
	return ""
}

func pStrSlice(m map[string]any, k string) []string {
	out := []string{}
	switch v := m[k].(type) {
	case []any:
		for _, x := range v {
			if s, ok := x.(string); ok && strings.TrimSpace(s) != "" {
				out = append(out, strings.TrimSpace(s))
			}
		}
	case []string:
		for _, s := range v {
			if strings.TrimSpace(s) != "" {
				out = append(out, strings.TrimSpace(s))
			}
		}
	}
	return out
}

// trackBroadcastClick marks a broadcast recipient as having tapped a CTA button.
// The button callback payload is "bc_<recipient_id>" (optionally "...<.button>").
func (a *app) trackBroadcastClick(ctx context.Context, payload string) {
	if !strings.HasPrefix(payload, "bc_") {
		return
	}
	rest := strings.TrimPrefix(payload, "bc_")
	recipID, button := rest, ""
	if i := strings.IndexByte(rest, '.'); i >= 0 {
		recipID, button = rest[:i], rest[i+1:]
	}
	if recipID == "" {
		return
	}
	if err := a.st.markBroadcastClick(ctx, recipID, button); err != nil {
		a.log.Warn("broadcast click track failed", "recip", recipID, "err", err)
		return
	}
	a.log.Info("broadcast click tracked", "recip", recipID, "button", button)
}

func postWebhook(url, orgID, convID string) {
	payload, _ := json.Marshal(map[string]string{"organization_id": orgID, "conversation_id": convID})
	req, err := http.NewRequest(http.MethodPost, url, strings.NewReader(string(payload)))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 8 * time.Second}
	if resp, err := client.Do(req); err == nil {
		_ = resp.Body.Close()
	}
}

// ── store methods ──

func (s *store) activeAutomations(ctx context.Context, orgID, channelID string) ([]autoRule, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id::text, trigger_type, COALESCE(trigger_config,'{}')::text,
		        COALESCE(actions,'[]')::text, COALESCE(flow,'{}')::text
		   FROM automations
		  WHERE organization_id=$1 AND is_active=true
		    AND trigger_type IN ('new_message','keyword_match','new_conversation','button_click')
		    AND (channel_id IS NULL OR channel_id::text=$2)`, orgID, channelID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []autoRule
	for rows.Next() {
		var r autoRule
		var tc, ac, fl string
		if err := rows.Scan(&r.ID, &r.TriggerType, &tc, &ac, &fl); err != nil {
			return nil, err
		}
		r.TriggerConfig, r.Actions, r.Flow = []byte(tc), []byte(ac), []byte(fl)
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *store) bumpAutomationRun(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx, `UPDATE automations SET run_count = run_count + 1, updated_at = now() WHERE id=$1`, id)
	return err
}

func (s *store) isFirstInbound(ctx context.Context, convID string) bool {
	var n int
	if err := s.pool.QueryRow(ctx,
		`SELECT count(*) FROM messages WHERE conversation_id=$1 AND direction='inbound'`, convID).Scan(&n); err != nil {
		return false
	}
	return n <= 1
}

func (s *store) addContactTags(ctx context.Context, contactID string, tags []string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE contacts SET tags = (
		   SELECT array_agg(DISTINCT t) FROM unnest(COALESCE(tags, '{}'::text[]) || $2::text[]) t
		 ), updated_at = now() WHERE id=$1`, contactID, tags)
	return err
}

func (s *store) removeContactTags(ctx context.Context, contactID string, tags []string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE contacts SET tags = (
		   SELECT COALESCE(array_agg(t), '{}'::text[])
		     FROM unnest(COALESCE(tags, '{}'::text[])) t
		    WHERE NOT (t = ANY($2::text[]))
		 ), updated_at = now() WHERE id=$1`, contactID, tags)
	return err
}

func (s *store) resolveAgentByName(ctx context.Context, orgID, name string) string {
	if name == "" {
		return ""
	}
	var id string
	_ = s.pool.QueryRow(ctx,
		`SELECT id::text FROM users
		  WHERE organization_id=$1 AND (id::text=$2 OR lower(full_name)=lower($2))
		  LIMIT 1`, orgID, name).Scan(&id)
	return id
}

func (s *store) assignConversation(ctx context.Context, convID, agentID string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE conversations SET assigned_agent_id=$2, updated_at=now() WHERE id=$1`, convID, agentID)
	return err
}

func (s *store) closeConversation(ctx context.Context, convID string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE conversations SET status='closed', updated_at=now() WHERE id=$1`, convID)
	return err
}

// markBroadcastClick records the first CTA tap for a broadcast recipient.
// id::text comparison avoids a uuid cast error on a malformed payload (no match).
func (s *store) markBroadcastClick(ctx context.Context, recipID, button string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE broadcast_recipients
		    SET clicked_at = COALESCE(clicked_at, now()),
		        clicked_button = COALESCE(clicked_button, NULLIF($2, ''))
		  WHERE id::text = $1`, recipID, button)
	return err
}
