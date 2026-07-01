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
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/simpulx/v2/libs/go/events"
	"github.com/simpulx/v2/libs/go/gsheets"
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
	From   string `json:"from"`
	To     string `json:"to"`
	Handle string `json:"handle,omitempty"` // "match" | "else" for Criteria Router branches
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
		n := a.walkFlow(ctx, orgID, convID, contactID, r)
		_ = a.st.bumpAutomationRun(ctx, r.ID)
		a.log.Info("automation fired", "id", r.ID, "trigger", r.TriggerType, "steps", n)
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

// walkFlow traverses the node graph from the trigger, executing action nodes and
// branching at Criteria Router / condition nodes (following the "match" or "else"
// edge). Falls back to the legacy ordered action list when there are no nodes.
// Returns the number of executed action steps. Guarded against cycles.
func (a *app) walkFlow(ctx context.Context, orgID, convID, contactID string, r autoRule) int {
	var f autoFlow
	if len(r.Flow) > 0 {
		_ = json.Unmarshal(r.Flow, &f)
	}
	if len(f.Nodes) == 0 {
		steps := flowSteps(r)
		for _, s := range steps {
			a.execStep(ctx, orgID, convID, contactID, s)
		}
		return len(steps)
	}

	byID := make(map[string]autoNode, len(f.Nodes))
	var triggerID string
	for _, n := range f.Nodes {
		byID[n.ID] = n
		if n.Type == "trigger" {
			triggerID = n.ID
		}
	}
	type link struct{ to, handle string }
	adj := make(map[string][]link)
	for _, e := range f.Edges {
		adj[e.From] = append(adj[e.From], link{e.To, e.Handle})
	}
	firstTo := func(id string) string {
		if len(adj[id]) > 0 {
			return adj[id][0].to
		}
		return ""
	}

	cur := firstTo(triggerID)
	seen := map[string]bool{}
	executed := 0
	for i := 0; cur != "" && i < 100; i++ {
		if seen[cur] {
			break
		}
		seen[cur] = true
		n := byID[cur]
		switch n.Type {
		case "condition", "criteria_router":
			want := "else"
			if a.evalCondition(ctx, orgID, contactID, n.Config) {
				want = "match"
			}
			next, fallback := "", ""
			for _, l := range adj[cur] {
				if l.handle == want {
					next = l.to
					break
				}
				if l.handle == "" && fallback == "" {
					fallback = l.to
				}
			}
			if next == "" {
				next = fallback
			}
			cur = next
		case "trigger":
			cur = firstTo(cur)
		default:
			a.execStep(ctx, orgID, convID, contactID, autoStep{Type: n.Type, Params: n.Config})
			executed++
			cur = firstTo(cur)
		}
	}
	return executed
}

// evalCondition evaluates a Criteria Router rule (contact attribute vs value)
// against the contact.
func (a *app) evalCondition(ctx context.Context, orgID, contactID string, cfg map[string]any) bool {
	attr := pStr(cfg, "attribute")
	if attr == "" {
		return false
	}
	op := pStr(cfg, "operator")
	val := pStr(cfg, "value")
	actual := a.st.contactField(ctx, contactID, attr)
	switch op {
	case "is_set":
		return actual != ""
	case "is_not_set":
		return actual == ""
	case "not_equals":
		return !strings.EqualFold(actual, val)
	case "contains":
		return val != "" && strings.Contains(strings.ToLower(actual), strings.ToLower(val))
	default: // equals
		return strings.EqualFold(actual, val)
	}
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
	case "assign_campaign":
		campID := pStr(s.Params, "campaign_id")
		if campID == "" {
			campID = a.st.resolveCampaignByName(ctx, orgID, pStr(s.Params, "campaign_name"))
		}
		if campID != "" {
			if err := a.st.assignCampaign(ctx, convID, campID); err != nil {
				a.log.Warn("automation assign_campaign failed", "err", err)
			}
		}
	case "set_contact_attribute":
		key := pStr(s.Params, "key")
		if key != "" {
			if err := a.st.setContactAttribute(ctx, contactID, key, pStr(s.Params, "value")); err != nil {
				a.log.Warn("automation set_contact_attribute failed", "err", err)
			}
		}
	case "set_conversation_status":
		st := pStr(s.Params, "status")
		if st == "open" || st == "closed" || st == "snoozed" {
			if err := a.st.setConversationStatus(ctx, convID, st); err != nil {
				a.log.Warn("automation set_conversation_status failed", "err", err)
			}
		}
	case "send_form":
		formID := pStr(s.Params, "form_id")
		if formID == "" {
			return
		}
		metaFlowID, ok := a.st.publishedFlowMeta(ctx, orgID, formID)
		if !ok {
			a.log.Warn("automation send_form: form not published", "form", formID)
			return
		}
		target, terr := a.st.sendTarget(ctx, convID)
		if terr != nil {
			a.log.Warn("automation send_form: no target", "err", terr)
			return
		}
		// Token encodes the form id so the nfm_reply webhook maps the response
		// back to this form (same scheme as the gateway's newFlowToken).
		tb := make([]byte, 8)
		_, _ = rand.Read(tb)
		token := "f-" + formID + "-" + hex.EncodeToString(tb)
		if _, err := a.snd.sendFlow(ctx, target, metaFlowID, token, pStr(s.Params, "cta"), pStr(s.Params, "body")); err != nil {
			a.log.Warn("automation send_form failed", "err", err)
		}
	case "google_sheet":
		sheetID := gsheets.ParseSpreadsheetID(pStr(s.Params, "sheet_url"))
		if sheetID != "" {
			row := a.st.contactSheetRow(ctx, contactID, pStrSlice(s.Params, "attributes"))
			client := &http.Client{Timeout: 12 * time.Second}
			if err := gsheets.AppendRow(ctx, client, sheetID, pStr(s.Params, "sheet_tab"), row); err != nil {
				a.log.Warn("automation google_sheet append failed", "err", err)
			}
		}
	case "unassign_team":
		if err := a.st.assignConversation(ctx, convID, ""); err != nil {
			a.log.Warn("automation unassign_team failed", "err", err)
		}
	case "remove_campaign":
		if err := a.st.removeCampaign(ctx, convID); err != nil {
			a.log.Warn("automation remove_campaign failed", "err", err)
		}
	case "blacklist":
		if err := a.st.setBlacklisted(ctx, contactID, true); err != nil {
			a.log.Warn("automation blacklist failed", "err", err)
		}
	case "add_to_sequence":
		if seq := pStr(s.Params, "sequence_id"); seq != "" {
			if err := a.st.enrollSequence(ctx, orgID, seq, contactID, convID); err != nil {
				a.log.Warn("automation add_to_sequence failed", "err", err)
			}
		}
	case "remove_from_sequence":
		if seq := pStr(s.Params, "sequence_id"); seq != "" {
			if err := a.st.unenrollSequence(ctx, seq, contactID); err != nil {
				a.log.Warn("automation remove_from_sequence failed", "err", err)
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
	// Empty agentID unassigns (assigned_agent_id -> NULL).
	_, err := s.pool.Exec(ctx,
		`UPDATE conversations SET assigned_agent_id=NULLIF($2,'')::uuid, updated_at=now() WHERE id=$1`, convID, agentID)
	return err
}

func (s *store) removeCampaign(ctx context.Context, convID string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE conversations SET campaign_id=NULL, updated_at=now() WHERE id=$1`, convID)
	return err
}

func (s *store) setBlacklisted(ctx context.Context, contactID string, v bool) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE contacts SET blacklisted=$2, updated_at=now() WHERE id=$1`, contactID, v)
	return err
}

func (s *store) enrollSequence(ctx context.Context, orgID, sequenceID, contactID, convID string) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO sequence_enrollments (organization_id, sequence_id, conversation_id, contact_id, current_step, next_run_at, status)
		 SELECT $1, $2::uuid, $3::uuid, $4::uuid, 0,
		        now() + (COALESCE((SELECT delay_minutes FROM sequence_steps WHERE sequence_id=$2::uuid AND step_order=1), 0) || ' minutes')::interval,
		        'active'
		 ON CONFLICT (sequence_id, conversation_id) DO UPDATE SET status='active', updated_at=now()`,
		orgID, sequenceID, convID, contactID)
	return err
}

func (s *store) unenrollSequence(ctx context.Context, sequenceID, contactID string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE sequence_enrollments SET status='stopped', updated_at=now()
		  WHERE sequence_id=$1::uuid AND contact_id=$2::uuid`, sequenceID, contactID)
	return err
}

// publishedFlowMeta returns the Meta flow id for a published WhatsApp Form.
func (s *store) publishedFlowMeta(ctx context.Context, orgID, formID string) (string, bool) {
	if formID == "" {
		return "", false
	}
	var meta string
	err := s.pool.QueryRow(ctx,
		`SELECT COALESCE(meta_flow_id,'') FROM wa_flows
		  WHERE id=$1::uuid AND organization_id=$2 AND status='published'`, formID, orgID).Scan(&meta)
	if err != nil || meta == "" {
		return "", false
	}
	return meta, true
}

func (s *store) resolveCampaignByName(ctx context.Context, orgID, name string) string {
	if name == "" {
		return ""
	}
	var id string
	_ = s.pool.QueryRow(ctx,
		`SELECT id::text FROM campaigns
		  WHERE organization_id=$1 AND (id::text=$2 OR lower(name)=lower($2))
		  LIMIT 1`, orgID, name).Scan(&id)
	return id
}

func (s *store) assignCampaign(ctx context.Context, convID, campaignID string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE conversations SET campaign_id=$2::uuid, updated_at=now() WHERE id=$1`, convID, campaignID)
	return err
}

func (s *store) setContactAttribute(ctx context.Context, contactID, key, value string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE contacts SET attributes = COALESCE(attributes,'{}'::jsonb) || jsonb_build_object($2::text, $3::text),
		        updated_at = now()
		  WHERE id = $1`, contactID, key, value)
	return err
}

// contactField reads a value for a Criteria Router condition: built-in columns
// (full_name / phone) or a custom attribute (attributes->>key).
func (s *store) contactField(ctx context.Context, contactID, key string) string {
	var v string
	switch key {
	case "full_name", "name":
		_ = s.pool.QueryRow(ctx, `SELECT COALESCE(full_name,'') FROM contacts WHERE id=$1`, contactID).Scan(&v)
	case "phone", "phone_number":
		_ = s.pool.QueryRow(ctx, `SELECT COALESCE(phone,'') FROM contacts WHERE id=$1`, contactID).Scan(&v)
	default:
		_ = s.pool.QueryRow(ctx, `SELECT COALESCE(attributes->>$2,'') FROM contacts WHERE id=$1`, contactID, key).Scan(&v)
	}
	return v
}

func (s *store) setConversationStatus(ctx context.Context, convID, status string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE conversations SET status=$2, updated_at=now() WHERE id=$1`, convID, status)
	return err
}

// contactSheetRow builds a row for the Google Sheet "add row" node:
// Timestamp, Name, Phone, then each requested contact attribute value.
func (s *store) contactSheetRow(ctx context.Context, contactID string, keys []string) []string {
	var name, phone string
	var attrs map[string]any
	_ = s.pool.QueryRow(ctx,
		`SELECT COALESCE(full_name,''), COALESCE(phone,''), COALESCE(attributes,'{}'::jsonb)
		   FROM contacts WHERE id=$1`, contactID).Scan(&name, &phone, &attrs)
	row := []string{time.Now().Format("2006-01-02 15:04:05"), name, phone}
	for _, k := range keys {
		v := ""
		if attrs != nil {
			if raw, ok := attrs[k]; ok {
				switch t := raw.(type) {
				case string:
					v = t
				default:
					b, _ := json.Marshal(t)
					v = string(b)
				}
			}
		}
		row = append(row, v)
	}
	return row
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
