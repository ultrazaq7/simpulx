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
	"regexp"
	"strings"
	"time"

	"github.com/simpulx/v2/libs/go/events"
	"github.com/simpulx/v2/libs/go/gsheets"
	"github.com/simpulx/v2/libs/go/mailer"
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

// triggerInput carries the inbound facts a trigger condition can test.
type triggerInput struct {
	body     string
	payload  string // tapped button / interactive callback id (empty for normal messages)
	msgType  string // text | image | video | audio | document | location | contacts | order | ...
	mediaExt string // lowercased attachment extension (from media_url), else ""
	isNew    bool   // first genuine inbound of the conversation
}

// runAutomations loads active automations for the org/channel and fires the ones
// whose trigger matches this inbound message.
func (a *app) runAutomations(ctx context.Context, orgID, convID, contactID, channelID, body, payload, msgType, mediaURL string) {
	rules, err := a.st.activeAutomations(ctx, orgID, channelID)
	if err != nil {
		a.log.Warn("load automations failed", "err", err)
		return
	}
	if len(rules) == 0 {
		return
	}
	in := triggerInput{
		body:     body,
		payload:  payload,
		msgType:  msgType,
		mediaExt: fileExt(mediaURL),
		isNew:    a.st.isFirstInbound(ctx, convID),
	}
	for _, r := range rules {
		if !a.triggerMatches(ctx, orgID, r, in, contactID, convID) {
			continue
		}
		n := a.walkFlow(ctx, orgID, convID, contactID, r)
		_ = a.st.bumpAutomationRun(ctx, r.ID)
		a.log.Info("automation fired", "id", r.ID, "trigger", r.TriggerType, "steps", n)
	}
}

// triggerMatches evaluates an automation's trigger. New model: trigger_config
// carries a "conditions" array [{type, ...}] where ALL must match (AND). When it
// is absent, it falls back to the legacy single trigger_type + flat trigger_config.
func (a *app) triggerMatches(ctx context.Context, orgID string, r autoRule, in triggerInput, contactID, convID string) bool {
	var cfg struct {
		Conditions []map[string]any `json:"conditions"`
	}
	_ = json.Unmarshal(r.TriggerConfig, &cfg)
	if len(cfg.Conditions) > 0 {
		for _, cond := range cfg.Conditions {
			if !a.conditionMatches(ctx, orgID, cond, in, contactID, convID) {
				return false
			}
		}
		return true
	}
	return legacyTriggerMatches(r, in)
}

// legacyTriggerMatches keeps the pre-multi-condition behavior for automations
// saved before the conditions array existed.
func legacyTriggerMatches(r autoRule, in triggerInput) bool {
	switch r.TriggerType {
	case "new_message":
		return true
	case "new_conversation":
		return in.isNew
	case "keyword_match":
		var cfg struct {
			Keywords      []string `json:"keywords"`
			CaseSensitive bool     `json:"case_sensitive"`
			MatchMode     string   `json:"match_mode"` // any (default) | all | exact | starts_with
		}
		_ = json.Unmarshal(r.TriggerConfig, &cfg)
		return keywordTriggerMatches(in.body, cfg.Keywords, cfg.MatchMode, cfg.CaseSensitive)
	case "button_click":
		if in.payload == "" {
			return false
		}
		var cfg struct {
			Callback string `json:"callback"`
		}
		_ = json.Unmarshal(r.TriggerConfig, &cfg)
		cb := strings.ToLower(strings.TrimSpace(cfg.Callback))
		return cb == "" || strings.Contains(strings.ToLower(in.payload), cb)
	}
	return false
}

// conditionMatches evaluates one condition from the multi-condition model.
// cond["type"] selects the check; the rest of the map is that check's config.
func (a *app) conditionMatches(ctx context.Context, orgID string, cond map[string]any, in triggerInput, contactID, convID string) bool {
	switch pStr(cond, "type") {
	case "all_messages", "individual_chat":
		// WhatsApp business chats are 1:1, so "individual chat" always holds.
		return true
	case "keyword_include", "keyword_match":
		mode := pStr(cond, "match_mode")
		if mode == "" {
			mode = "any"
		}
		return keywordTriggerMatches(in.body, pStrSlice(cond, "keywords"), mode, pBool(cond, "case_sensitive"))
	case "keyword_exact":
		return keywordTriggerMatches(in.body, pStrSlice(cond, "keywords"), "exact", pBool(cond, "case_sensitive"))
	case "keyword_exclude":
		ks := pStrSlice(cond, "keywords")
		if len(ks) == 0 {
			return true
		}
		return !keywordTriggerMatches(in.body, ks, "any", pBool(cond, "case_sensitive"))
	case "regex_match":
		pat := pStr(cond, "pattern")
		if pat == "" {
			return false
		}
		re, err := regexp.Compile(pat)
		return err == nil && re.MatchString(in.body)
	case "callback_id", "button_click", "list_button_callback":
		if in.payload == "" {
			return false
		}
		cb := strings.ToLower(pStr(cond, "callback"))
		return cb == "" || strings.Contains(strings.ToLower(in.payload), cb)
	case "message_type":
		for _, t := range pStrSlice(cond, "message_types") {
			if strings.EqualFold(t, in.msgType) {
				return true
			}
		}
		return false
	case "file_type":
		if in.mediaExt == "" {
			return false
		}
		for _, e := range pStrSlice(cond, "extensions") {
			if strings.EqualFold(strings.TrimPrefix(e, "."), in.mediaExt) {
				return true
			}
		}
		return false
	case "catalog_order":
		return in.msgType == "order"
	case "first_or_after_24h":
		// TODO: also fire when >24h since the previous message (needs prev-message lookup).
		return in.isNew
	case "custom_condition":
		return a.evalCondition(ctx, orgID, contactID, cond)
	case "office_hours", "after_hours", "template_message":
		// TODO: office/after hours need the org's business-hours config; template_message
		// needs inbound-template detection. Not evaluated yet -> condition not met.
		a.log.Info("automation trigger condition not yet supported", "type", pStr(cond, "type"))
		return false
	}
	return false
}

// keywordTriggerMatches evaluates a keyword_match trigger against the message
// body. mode: "any" (default, contains at least one keyword), "all" (contains
// every keyword), "exact" (body equals a keyword), "starts_with" (body starts
// with a keyword). caseSensitive toggles case folding.
func keywordTriggerMatches(body string, keywords []string, mode string, caseSensitive bool) bool {
	norm := func(s string) string {
		s = strings.TrimSpace(s)
		if !caseSensitive {
			s = strings.ToLower(s)
		}
		return s
	}
	b := norm(body)
	kws := make([]string, 0, len(keywords))
	for _, k := range keywords {
		if k = norm(k); k != "" {
			kws = append(kws, k)
		}
	}
	if len(kws) == 0 {
		return false
	}
	switch mode {
	case "all":
		for _, k := range kws {
			if !strings.Contains(b, k) {
				return false
			}
		}
		return true
	case "exact":
		for _, k := range kws {
			if b == k {
				return true
			}
		}
		return false
	case "starts_with":
		for _, k := range kws {
			if strings.HasPrefix(b, k) {
				return true
			}
		}
		return false
	default: // "any"
		for _, k := range kws {
			if strings.Contains(b, k) {
				return true
			}
		}
		return false
	}
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
	// Never auto-send a customer-facing message to a lead nobody owns yet. An
	// unassigned lead must be handled by a human, not an automation — auto-send is
	// fine, but not for unassigned leads. Routing/tagging/notification actions are
	// unaffected (they help get the lead owned or logged).
	switch s.Type {
	case "send_message", "send_template", "send_form":
		if !a.st.isAssigned(ctx, convID) {
			a.log.Info("automation send skipped: lead unassigned", "type", s.Type, "conv", convID)
			return
		}
		// AI/automation non-collision (WS-H): when the conversation's campaign has
		// AI auto-reply on AND the bot is still actively handling this conversation,
		// the AI owns customer messaging — an automation must NOT also send (double
		// reply). Non-messaging actions (tag/assign/close/webhook) are unaffected.
		if a.st.isBotHandling(ctx, convID) {
			a.log.Info("automation send skipped: AI bot handling conversation", "type", s.Type, "conv", convID)
			return
		}
	}

	switch s.Type {
	case "send_message":
		vars := a.st.contactVars(ctx, contactID)
		// Composed auto-reply: a body + an optional image + an optional interactive
		// (reply buttons / list). We send the richest form the config provides, so
		// "text + buttons", "image + buttons", "image only" and "text only" all work
		// from one node. `interactive` is the new field; `message_type` is the
		// legacy single-type field kept for older saved nodes.
		interactive := pStr(s.Params, "interactive")
		if mt := pStr(s.Params, "message_type"); interactive == "" && (mt == "buttons" || mt == "list") {
			interactive = mt
		}
		if interactive == "buttons" || interactive == "list" {
			// A list can't carry an image header on WhatsApp, so send its image (if
			// any) as a separate message first. Buttons keep the image as a header.
			if interactive == "list" {
				if url := pStr(s.Params, "media_url"); url != "" {
					_ = a.bus.Publish(events.SubjectMessageOutbound, orgID, events.MessageOutbound{
						ConversationID: convID, SenderType: "system", Type: "image", MediaURL: url,
					})
				}
			}
			inter := buildInteractive(vars, s.Params, interactive)
			if inter == nil {
				a.log.Warn("automation send_message: invalid interactive config", "type", interactive, "conv", convID)
				return
			}
			_ = a.bus.Publish(events.SubjectMessageOutbound, orgID, events.MessageOutbound{
				ConversationID: convID, SenderType: "system", Type: "interactive",
				Body: inter.Body, Interactive: inter,
			})
			return
		}
		// No interactive: an image (with caption) or plain text.
		body := pStr(s.Params, "message")
		if body == "" {
			body = pStr(s.Params, "body")
		}
		if url := pStr(s.Params, "media_url"); url != "" {
			_ = a.bus.Publish(events.SubjectMessageOutbound, orgID, events.MessageOutbound{
				ConversationID: convID, SenderType: "system", Type: "image",
				MediaURL: url, Body: resolvePlaceholders(vars, body),
			})
			return
		}
		if body == "" {
			return
		}
		_ = a.bus.Publish(events.SubjectMessageOutbound, orgID, events.MessageOutbound{
			ConversationID: convID, SenderType: "system", Type: "text",
			Body: resolvePlaceholders(vars, body),
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
		vars := a.st.contactVars(ctx, contactID)
		// Multi-row: params.mappings = [{attribute|key, value}]. Values support
		// {placeholders}. Falls back to a single key/value for older nodes.
		if raw, ok := s.Params["mappings"].([]any); ok && len(raw) > 0 {
			for _, r := range raw {
				m, _ := r.(map[string]any)
				key := pStr(m, "attribute")
				if key == "" {
					key = pStr(m, "key")
				}
				if key == "" {
					continue
				}
				if err := a.st.setContactAttribute(ctx, contactID, key, resolvePlaceholders(vars, pStr(m, "value"))); err != nil {
					a.log.Warn("automation set_contact_attribute failed", "err", err)
				}
			}
		} else if key := pStr(s.Params, "key"); key != "" {
			if err := a.st.setContactAttribute(ctx, contactID, key, resolvePlaceholders(vars, pStr(s.Params, "value"))); err != nil {
				a.log.Warn("automation set_contact_attribute failed", "err", err)
			}
		}
	case "send_template":
		name := pStr(s.Params, "template_name")
		if name == "" {
			name = pStr(s.Params, "template")
		}
		if name == "" {
			return
		}
		target, terr := a.st.sendTarget(ctx, convID)
		if terr != nil {
			a.log.Warn("automation send_template: no target", "err", terr)
			return
		}
		if _, err := a.snd.sendTemplate(ctx, target, name, pStr(s.Params, "language")); err != nil {
			a.log.Warn("automation send_template failed", "err", err)
		}
	case "set_priority":
		if p := pStr(s.Params, "priority"); p == "high" || p == "medium" || p == "low" {
			if err := a.st.setLeadPriority(ctx, convID, p); err != nil {
				a.log.Warn("automation set_priority failed", "err", err)
			}
		}
	case "send_email":
		to := pStr(s.Params, "to")
		if to == "" {
			return
		}
		vars := a.st.contactVars(ctx, contactID)
		to = resolvePlaceholders(vars, to)
		subject := resolvePlaceholders(vars, pStr(s.Params, "subject"))
		body := resolvePlaceholders(vars, pStr(s.Params, "body"))
		if _, err := mailer.Send(to, subject, body, true); err != nil {
			a.log.Warn("automation send_email failed", "err", err)
		}
	case "set_conversation_status":
		st := pStr(s.Params, "status")
		if st == "open" || st == "closed" || st == "snoozed" {
			if err := a.st.setConversationStatus(ctx, convID, st); err != nil {
				a.log.Warn("automation set_conversation_status failed", "err", err)
			}
		}
	case "set_stage":
		if err := a.st.setStage(ctx, orgID, convID, pStr(s.Params, "stage_id")); err != nil {
			a.log.Warn("automation set_stage failed", "err", err)
		}
	case "set_interest":
		if err := a.st.setInterest(ctx, orgID, convID, pStr(s.Params, "interest_level")); err != nil {
			a.log.Warn("automation set_interest failed", "err", err)
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
	case "close_conversation":
		if err := a.st.closeConversation(ctx, convID); err != nil {
			a.log.Warn("automation close_conversation failed", "err", err)
		}
	case "webhook_notify":
		if url := pStr(s.Params, "url"); url != "" {
			go postWebhook(url, orgID, convID)
		}
	case "rest_api", "call_rest_api":
		// Full outbound HTTP call: method + URL + headers + body, all with
		// {placeholder} merge fields. Fire-and-forget so it never blocks the flow.
		vars := a.st.contactVars(ctx, contactID)
		url := resolvePlaceholders(vars, pStr(s.Params, "url"))
		if url == "" {
			return
		}
		method := strings.ToUpper(strings.TrimSpace(pStr(s.Params, "method")))
		if method == "" {
			method = "POST"
		}
		body := resolvePlaceholders(vars, pStr(s.Params, "body"))
		headers := map[string]string{}
		if raw, ok := s.Params["headers"].([]any); ok {
			for _, r := range raw {
				m, _ := r.(map[string]any)
				if k := strings.TrimSpace(pStr(m, "key")); k != "" {
					headers[k] = resolvePlaceholders(vars, pStr(m, "value"))
				}
			}
		}
		go callRestAPI(method, url, headers, body)
	default:
		a.log.Info("automation action not yet supported", "type", s.Type)
	}
}

// ── placeholders / merge fields ──
var placeholderRe = regexp.MustCompile(`\{([a-zA-Z0-9_]+)\}`)

// resolvePlaceholders replaces {full_name}, {first_name}, {phone} and any
// {contact_attribute} with the contact's values. Unknown tokens are left as-is.
func resolvePlaceholders(vars map[string]string, s string) string {
	if s == "" || !strings.Contains(s, "{") {
		return s
	}
	return placeholderRe.ReplaceAllStringFunc(s, func(tok string) string {
		if v, ok := vars[tok[1:len(tok)-1]]; ok {
			return v
		}
		return tok
	})
}

// contactVars returns the merge-field values for a contact: built-ins + every
// custom attribute.
func (s *store) contactVars(ctx context.Context, contactID string) map[string]string {
	m := map[string]string{}
	var name, phone string
	var attrs map[string]any
	_ = s.pool.QueryRow(ctx,
		`SELECT COALESCE(full_name,''), COALESCE(phone,''), COALESCE(attributes,'{}'::jsonb)
		   FROM contacts WHERE id=$1`, contactID).Scan(&name, &phone, &attrs)
	m["full_name"] = name
	m["name"] = name
	first := name
	if i := strings.IndexByte(name, ' '); i > 0 {
		first = name[:i]
	}
	m["first_name"] = first
	m["phone"] = phone
	for k, v := range attrs {
		switch t := v.(type) {
		case string:
			m[k] = t
		case nil:
			m[k] = ""
		default:
			b, _ := json.Marshal(t)
			m[k] = string(b)
		}
	}
	return m
}

// buildInteractive turns an auto-reply node's params into a WhatsApp interactive
// payload (reply buttons or list). Placeholders in the text fields are resolved
// against the contact. Returns nil when the config is incomplete/invalid.
func buildInteractive(vars map[string]string, params map[string]any, mt string) *events.InteractiveOutbound {
	body := pStr(params, "body")
	if body == "" {
		body = pStr(params, "message")
	}
	if body == "" {
		return nil
	}
	out := &events.InteractiveOutbound{
		Type:   mt,
		Body:   resolvePlaceholders(vars, body),
		Footer: resolvePlaceholders(vars, pStr(params, "footer")),
	}
	// Header: WhatsApp allows an image header only on button messages, so an
	// uploaded image becomes the header there; a list uses a text header (its
	// image is sent as a separate message by the caller).
	if hurl := pStr(params, "media_url"); hurl != "" && mt == "buttons" {
		out.HeaderType = "image"
		out.HeaderImageURL = resolvePlaceholders(vars, hurl)
	} else if h := pStr(params, "header"); h != "" {
		out.HeaderType = "text"
		out.Header = resolvePlaceholders(vars, h)
	}
	switch mt {
	case "buttons":
		raw, _ := params["buttons"].([]any)
		for _, r := range raw {
			m, _ := r.(map[string]any)
			title := pStr(m, "title")
			if title == "" {
				title = pStr(m, "label")
			}
			if title == "" {
				continue
			}
			id := pStr(m, "id")
			if id == "" {
				id = title
			}
			out.Buttons = append(out.Buttons, events.InteractiveButton{ID: id, Title: title})
			if len(out.Buttons) >= 3 { // WhatsApp caps reply buttons at 3
				break
			}
		}
		if len(out.Buttons) == 0 {
			return nil
		}
	case "list":
		out.ButtonText = pStr(params, "button_text")
		raw, _ := params["sections"].([]any)
		for _, r := range raw {
			m, _ := r.(map[string]any)
			sec := events.InteractiveSection{Title: pStr(m, "title")}
			rows, _ := m["rows"].([]any)
			for _, rr := range rows {
				rm, _ := rr.(map[string]any)
				title := pStr(rm, "title")
				if title == "" {
					continue
				}
				id := pStr(rm, "id")
				if id == "" {
					id = title
				}
				sec.Rows = append(sec.Rows, events.InteractiveRow{
					ID: id, Title: title, Description: pStr(rm, "description"),
				})
			}
			if len(sec.Rows) > 0 {
				out.Sections = append(out.Sections, sec)
			}
		}
		if len(out.Sections) == 0 {
			return nil
		}
	default:
		return nil
	}
	return out
}

// ── param helpers ──
func pStr(m map[string]any, k string) string {
	if v, ok := m[k].(string); ok {
		return strings.TrimSpace(v)
	}
	return ""
}

func pBool(m map[string]any, k string) bool {
	v, _ := m[k].(bool)
	return v
}

// fileExt returns the lowercased extension of a media URL's filename (no dot),
// e.g. "https://.../doc.pdf?x=1" -> "pdf". Empty when there is none.
func fileExt(mediaURL string) string {
	if mediaURL == "" {
		return ""
	}
	u := mediaURL
	if i := strings.IndexByte(u, '?'); i >= 0 {
		u = u[:i]
	}
	slash := strings.LastIndexByte(u, '/')
	dot := strings.LastIndexByte(u, '.')
	if dot >= 0 && dot > slash {
		return strings.ToLower(u[dot+1:])
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

// callRestAPI performs an arbitrary outbound HTTP call for the "Call REST API"
// automation node. Fire-and-forget; failures are swallowed (like postWebhook).
func callRestAPI(method, url string, headers map[string]string, body string) {
	req, err := http.NewRequest(method, url, strings.NewReader(body))
	if err != nil {
		return
	}
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range headers {
		req.Header.Set(k, v) // explicit headers win (e.g. Authorization, custom CT)
	}
	client := &http.Client{Timeout: 15 * time.Second}
	if resp, err := client.Do(req); err == nil {
		_ = resp.Body.Close()
	}
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

// isAssigned reports whether the conversation currently has a human owner
// (assigned_agent_id set). Used to gate customer-facing auto-sends so an
// unassigned lead is never auto-messaged.
func (s *store) isAssigned(ctx context.Context, convID string) bool {
	var assigned bool
	_ = s.pool.QueryRow(ctx,
		`SELECT assigned_agent_id IS NOT NULL FROM conversations WHERE id=$1`, convID).Scan(&assigned)
	return assigned
}

// isBotHandling reports whether the AI assistant currently owns customer
// messaging for this conversation: the campaign opted into ai_auto_reply AND the
// bot has not stood down (is_bot_active). Used so a manual automation flow never
// double-replies over the live AI (WS-H collision guard). Once the bot hands off
// (is_bot_active=false) or the campaign has auto-reply off, automations send freely.
func (s *store) isBotHandling(ctx context.Context, convID string) bool {
	var handling bool
	_ = s.pool.QueryRow(ctx,
		`SELECT COALESCE(cmp.ai_auto_reply, false) AND COALESCE(cv.is_bot_active, false)
		   FROM conversations cv
		   LEFT JOIN campaigns cmp ON cmp.id = cv.campaign_id
		  WHERE cv.id = $1`, convID).Scan(&handling)
	return handling
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

func (s *store) setLeadPriority(ctx context.Context, convID, priority string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE conversations SET lead_priority=$2, updated_at=now() WHERE id=$1`, convID, priority)
	return err
}

func (s *store) setBlacklisted(ctx context.Context, contactID string, v bool) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE contacts SET blacklisted=$2, updated_at=now() WHERE id=$1`, contactID, v)
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

// setStage sets the conversation's pipeline stage (automation "Set stage" node)
// and records a stage_changed event so the change counts toward the funnel
// (0075_stage_max_reached reads these events). Only a stage owned by the org is
// accepted; anything else is a no-op.
func (s *store) setStage(ctx context.Context, orgID, convID, stageID string) error {
	if stageID == "" {
		return nil
	}
	var stageName string
	if err := s.pool.QueryRow(ctx,
		`SELECT COALESCE(name,'') FROM stages WHERE id=$1::uuid AND organization_id=$2`,
		stageID, orgID).Scan(&stageName); err != nil {
		return nil // unknown / foreign stage -> skip silently
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx,
		`UPDATE conversations SET stage_id=$2::uuid, classification_locked=true, updated_at=now()
		  WHERE id=$1 AND organization_id=$3`, convID, stageID, orgID); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx,
		`INSERT INTO conversation_events (organization_id, conversation_id, type, actor_type, detail)
		 VALUES ($1,$2,'stage_changed','system', jsonb_build_object('stage_id',$3::text,'stage_name',$4::text))`,
		orgID, convID, stageID, stageName); err != nil {
		return err
	}
	if err = tx.Commit(ctx); err != nil {
		return err
	}
	_ = s.bus.Publish(events.SubjectConversationUpdated, orgID, events.ConversationUpdated{
		ConversationID: convID, StageID: stageID,
	})
	return nil
}

// setInterest sets the lead interest/temperature (automation "Set interest level"
// node) and records an interest_changed event for the contact history.
func (s *store) setInterest(ctx context.Context, orgID, convID, level string) error {
	switch level {
	case "hot", "warm", "cold":
	default:
		return nil
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx,
		`UPDATE conversations SET interest_level=$2, updated_at=now()
		  WHERE id=$1 AND organization_id=$3`, convID, level, orgID); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx,
		`INSERT INTO conversation_events (organization_id, conversation_id, type, actor_type, detail)
		 VALUES ($1,$2,'interest_changed','system', jsonb_build_object('interest_level',$3::text))`,
		orgID, convID, level); err != nil {
		return err
	}
	if err = tx.Commit(ctx); err != nil {
		return err
	}
	_ = s.bus.Publish(events.SubjectConversationUpdated, orgID, events.ConversationUpdated{
		ConversationID: convID, InterestLevel: level,
	})
	return nil
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
