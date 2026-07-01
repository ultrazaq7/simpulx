package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"sort"
	"strings"
	"time"

	"github.com/simpulx/v2/libs/go/config"
)

// ============================================================
// WhatsApp Forms — native Meta WhatsApp Flows.
// Author a form in the builder (`definition`: screens + components), compile to
// Meta Flow JSON, publish to a WABA, send it as an interactive flow message, and
// capture nfm_reply submissions into wa_flow_responses.
// ============================================================

// ── Builder model (what the web builder edits and sends us) ──
type flowComponent struct {
	Type     string   `json:"type"`     // heading|body|caption|text_input|text_area|dropdown|radio|checkbox|date|chips
	Name     string   `json:"name"`     // field name (inputs only)
	Label    string   `json:"label"`    // input label
	Text     string   `json:"text"`     // heading/body/caption text
	Required bool     `json:"required"` // inputs
	Options  []string `json:"options"`  // dropdown/radio/checkbox/chips choices
}

type flowScreen struct {
	ID         string          `json:"id"`
	Title      string          `json:"title"`
	Components []flowComponent `json:"components"`
}

type flowDefinition struct {
	Screens []flowScreen `json:"screens"`
}

func nz(a, b string) string {
	if strings.TrimSpace(a) != "" {
		return a
	}
	return b
}

func optSource(opts []string) []map[string]any {
	out := make([]map[string]any, 0, len(opts))
	for _, o := range opts {
		o = strings.TrimSpace(o)
		if o == "" {
			continue // ignore blank lines from the options editor
		}
		// id == title so the submitted value is the human-readable choice.
		out = append(out, map[string]any{"id": o, "title": o})
	}
	return out
}

// compileFlowJSON turns our builder definition into Meta Flow JSON. Screens are
// chained: each screen forwards previously-collected fields (via ${data.x}) plus
// its own (via ${form.x}); the last screen's footer `complete`s with everything.
func compileFlowJSON(def flowDefinition) (string, error) {
	if len(def.Screens) == 0 {
		return "", fmt.Errorf("form has no screens")
	}
	type fieldRef struct{ name, kind string } // kind: string | array
	var prior []fieldRef
	metaScreens := make([]map[string]any, 0, len(def.Screens))

	for i, sc := range def.Screens {
		last := i == len(def.Screens)-1
		formChildren := make([]map[string]any, 0, len(sc.Components)+1)
		var own []fieldRef

		for _, c := range sc.Components {
			switch c.Type {
			case "heading":
				formChildren = append(formChildren, map[string]any{"type": "TextHeading", "text": nz(c.Text, c.Label)})
			case "body":
				formChildren = append(formChildren, map[string]any{"type": "TextBody", "text": c.Text})
			case "caption":
				formChildren = append(formChildren, map[string]any{"type": "TextCaption", "text": c.Text})
			case "text_input":
				formChildren = append(formChildren, map[string]any{"type": "TextInput", "name": c.Name, "label": nz(c.Label, c.Name), "required": c.Required, "input-type": "text"})
				own = append(own, fieldRef{c.Name, "string"})
			case "text_area":
				formChildren = append(formChildren, map[string]any{"type": "TextArea", "name": c.Name, "label": nz(c.Label, c.Name), "required": c.Required})
				own = append(own, fieldRef{c.Name, "string"})
			case "dropdown", "chips":
				formChildren = append(formChildren, map[string]any{"type": "Dropdown", "name": c.Name, "label": nz(c.Label, c.Name), "required": c.Required, "data-source": optSource(c.Options)})
				own = append(own, fieldRef{c.Name, "string"})
			case "radio":
				formChildren = append(formChildren, map[string]any{"type": "RadioButtonsGroup", "name": c.Name, "label": nz(c.Label, c.Name), "required": c.Required, "data-source": optSource(c.Options)})
				own = append(own, fieldRef{c.Name, "string"})
			case "checkbox":
				formChildren = append(formChildren, map[string]any{"type": "CheckboxGroup", "name": c.Name, "label": nz(c.Label, c.Name), "required": c.Required, "data-source": optSource(c.Options)})
				own = append(own, fieldRef{c.Name, "array"})
			case "date":
				formChildren = append(formChildren, map[string]any{"type": "DatePicker", "name": c.Name, "label": nz(c.Label, c.Name), "required": c.Required})
				own = append(own, fieldRef{c.Name, "string"})
			}
		}

		payload := map[string]any{}
		for _, f := range prior {
			payload[f.name] = "${data." + f.name + "}"
		}
		for _, f := range own {
			payload[f.name] = "${form." + f.name + "}"
		}

		var action map[string]any
		footer := "Continue"
		if last {
			action = map[string]any{"name": "complete", "payload": payload}
			footer = "Submit"
		} else {
			action = map[string]any{"name": "navigate", "next": map[string]any{"type": "screen", "name": fmt.Sprintf("SCREEN_%d", i+1)}, "payload": payload}
		}
		formChildren = append(formChildren, map[string]any{"type": "Footer", "label": footer, "on-click-action": action})

		data := map[string]any{}
		for _, f := range prior {
			if f.kind == "array" {
				data[f.name] = map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "__example__": []string{}}
			} else {
				data[f.name] = map[string]any{"type": "string", "__example__": ""}
			}
		}

		metaScreens = append(metaScreens, map[string]any{
			"id":       fmt.Sprintf("SCREEN_%d", i),
			"title":    nz(sc.Title, "Form"),
			"terminal": last,
			"data":     data,
			"layout": map[string]any{
				"type":     "SingleColumnLayout",
				"children": []map[string]any{{"type": "Form", "name": fmt.Sprintf("form_%d", i), "children": formChildren}},
			},
		})
		prior = append(prior, own...)
	}

	b, err := json.Marshal(map[string]any{"version": "5.1", "screens": metaScreens})
	return string(b), err
}

// ── CRUD ────────────────────────────────────────────────────

// GET /api/wa-flows
func (s *server) handleListFlows(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	args := []any{a.OrgID}
	chFilter := ""
	if ch := r.URL.Query().Get("channel_id"); ch != "" {
		args = append(args, ch)
		chFilter = fmt.Sprintf(" AND f.channel_id = $%d", len(args))
	}
	rows, err := s.queryMaps(r.Context(),
		fmt.Sprintf(`SELECT f.id::text AS id, f.name, f.status, f.meta_flow_id, f.categories,
		        f.channel_id::text AS channel_id, c.name AS channel_name,
		        f.publish_error, f.created_at, f.updated_at,
		        (SELECT count(*) FROM wa_flow_responses r WHERE r.flow_id=f.id) AS response_count
		   FROM wa_flows f
		   LEFT JOIN channels c ON c.id = f.channel_id
		  WHERE f.organization_id=$1%s
		  ORDER BY f.updated_at DESC`, chFilter), args...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

// GET /api/wa-flows/{id} — includes the builder definition + compiled JSON.
func (s *server) handleGetFlow(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	rows, err := s.queryMaps(r.Context(),
		`SELECT id::text AS id, name, status, meta_flow_id, categories,
		        channel_id::text AS channel_id, definition, flow_json, publish_error,
		        sheet_id, sheet_tab, sheet_enabled
		   FROM wa_flows WHERE id=$1 AND organization_id=$2`,
		r.PathValue("id"), a.OrgID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if len(rows) == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	writeJSON(w, rows[0])
}

type flowInput struct {
	Name         string          `json:"name"`
	ChannelID    string          `json:"channel_id"`
	Categories   json.RawMessage `json:"categories"`
	Definition   json.RawMessage `json:"definition"`
	SheetID      *string         `json:"sheet_id"`      // full URL or raw id
	SheetTab     *string         `json:"sheet_tab"`     // worksheet/tab name
	SheetEnabled *bool           `json:"sheet_enabled"` // append responses to the sheet
}

// POST /api/wa-flows
func (s *server) handleCreateFlow(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var b flowInput
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil || strings.TrimSpace(b.Name) == "" {
		http.Error(w, "name required", http.StatusBadRequest)
		return
	}
	var id string
	err := s.pool.QueryRow(r.Context(),
		`INSERT INTO wa_flows (organization_id, name, channel_id, categories, definition, created_by)
		 VALUES ($1,$2, NULLIF($3,'')::uuid,
		         COALESCE($4::jsonb,'["OTHER"]'::jsonb),
		         COALESCE($5::jsonb,'{"screens":[]}'::jsonb), $6)
		 RETURNING id::text`,
		a.OrgID, b.Name, b.ChannelID, rawOrNil(b.Categories), rawOrNil(b.Definition), a.UserID).Scan(&id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.audit(r.Context(), a, "created", "wa_flow", id, map[string]any{"name": b.Name})
	writeJSON(w, map[string]any{"id": id})
}

// PATCH /api/wa-flows/{id} — save the builder definition / rename. Editing a
// published form drops it back to draft until re-published.
func (s *server) handleUpdateFlow(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	var b flowInput
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	var sheetIDArg any
	if b.SheetID != nil {
		sheetIDArg = parseSpreadsheetID(*b.SheetID)
	}
	tag, err := s.pool.Exec(r.Context(),
		`UPDATE wa_flows SET
		   name          = COALESCE(NULLIF($3,''), name),
		   channel_id    = COALESCE(NULLIF($4,'')::uuid, channel_id),
		   categories    = COALESCE($5::jsonb, categories),
		   definition    = COALESCE($6::jsonb, definition),
		   sheet_id      = COALESCE($7, sheet_id),
		   sheet_tab     = COALESCE(NULLIF($8,''), sheet_tab),
		   sheet_enabled = COALESCE($9, sheet_enabled),
		   updated_at    = now()
		 WHERE id=$1 AND organization_id=$2`,
		r.PathValue("id"), a.OrgID, b.Name, b.ChannelID, rawOrNil(b.Categories), rawOrNil(b.Definition),
		sheetIDArg, b.SheetTab, b.SheetEnabled)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	writeJSON(w, map[string]any{"status": "saved"})
}

// DELETE /api/wa-flows/{id}
func (s *server) handleDeleteFlow(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	tag, err := s.pool.Exec(r.Context(),
		`DELETE FROM wa_flows WHERE id=$1 AND organization_id=$2`, r.PathValue("id"), a.OrgID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	writeJSON(w, map[string]any{"status": "deleted"})
}

// ── Meta Flows API ──────────────────────────────────────────

// resolveFlowWABA returns (waba_id, phone_number_id, token) for the org. Prefers
// the explicit channel, else the first connected WhatsApp channel with a WABA.
func (s *server) resolveFlowWABA(ctx context.Context, orgID, channelID string) (string, string, string, error) {
	var waba, pnid, token string
	var err error
	if channelID != "" {
		err = s.pool.QueryRow(ctx,
			`SELECT COALESCE(waba_id,''), COALESCE(phone_number_id,''), COALESCE(access_token,'')
			   FROM channels WHERE id=$1 AND organization_id=$2`, channelID, orgID).
			Scan(&waba, &pnid, &token)
	} else {
		err = s.pool.QueryRow(ctx,
			`SELECT COALESCE(waba_id,''), COALESCE(phone_number_id,''), COALESCE(access_token,'')
			   FROM channels
			  WHERE organization_id=$1 AND type='whatsapp' AND waba_id IS NOT NULL AND waba_id<>''
			  ORDER BY created_at LIMIT 1`, orgID).Scan(&waba, &pnid, &token)
	}
	if err != nil {
		return "", "", "", err
	}
	if waba == "" || token == "" {
		return "", "", "", fmt.Errorf("channel has no WABA / access token")
	}
	return waba, pnid, token, nil
}

// createMetaFlow creates a draft Flow on the WABA and returns its Meta id.
func (s *server) createMetaFlow(ctx context.Context, waba, token, name string, categories []string) (string, error) {
	if len(categories) == 0 {
		categories = []string{"OTHER"}
	}
	body, err := s.metaPost(ctx, fmt.Sprintf("%s/%s/flows", graphBase, waba), token,
		map[string]any{"name": name, "categories": categories})
	if err != nil {
		return "", err
	}
	var out struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(body, &out)
	if out.ID == "" {
		return "", fmt.Errorf("meta flow create returned no id: %s", string(body))
	}
	return out.ID, nil
}

// metaUploadFlowAsset uploads the compiled flow.json as the flow's FLOW_JSON asset.
func (s *server) metaUploadFlowAsset(ctx context.Context, flowID, token string, flowJSON []byte) error {
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	_ = mw.WriteField("name", "flow.json")
	_ = mw.WriteField("asset_type", "FLOW_JSON")
	// Meta requires the file part to be application/json; CreateFormFile would
	// default to application/octet-stream (which Meta rejects with #100), so set
	// the part header explicitly.
	ph := textproto.MIMEHeader{}
	ph.Set("Content-Disposition", `form-data; name="file"; filename="flow.json"`)
	ph.Set("Content-Type", "application/json")
	fw, err := mw.CreatePart(ph)
	if err != nil {
		return err
	}
	if _, err = fw.Write(flowJSON); err != nil {
		return err
	}
	_ = mw.Close()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		fmt.Sprintf("%s/%s/assets", graphBase, flowID), &buf)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b := new(bytes.Buffer)
		_, _ = b.ReadFrom(resp.Body)
		return fmt.Errorf("flow asset upload %d: %s", resp.StatusCode, b.String())
	}
	return nil
}

// POST /api/wa-flows/{id}/publish — compile, push to Meta, publish, persist state.
func (s *server) handlePublishFlow(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	id := r.PathValue("id")

	var name, metaFlowID, defJSON, catJSON, channelID string
	err := s.pool.QueryRow(r.Context(),
		`SELECT name, COALESCE(meta_flow_id,''), definition::text, categories::text,
		        COALESCE(channel_id::text,'')
		   FROM wa_flows WHERE id=$1 AND organization_id=$2`,
		id, a.OrgID).Scan(&name, &metaFlowID, &defJSON, &catJSON, &channelID)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	var def flowDefinition
	if err := json.Unmarshal([]byte(defJSON), &def); err != nil {
		http.Error(w, "invalid definition", http.StatusBadRequest)
		return
	}
	flowJSON, err := compileFlowJSON(def)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	var categories []string
	_ = json.Unmarshal([]byte(catJSON), &categories)

	// In mock mode (local/dev) skip the Meta round-trip but still persist the
	// compiled JSON so the builder + responses can be exercised end to end.
	if config.GetBool("WA_MOCK", true) {
		if metaFlowID == "" {
			metaFlowID = "MOCK-FLOW-" + id[:8]
		}
		s.markFlowPublished(r.Context(), id, a.OrgID, metaFlowID, flowJSON, "")
		writeJSON(w, map[string]any{"status": "published", "meta_flow_id": metaFlowID, "mock": true})
		return
	}

	waba, _, token, err := s.resolveFlowWABA(r.Context(), a.OrgID, channelID)
	if err != nil {
		s.markFlowPublished(r.Context(), id, a.OrgID, metaFlowID, flowJSON, err.Error())
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if metaFlowID == "" {
		metaFlowID, err = s.createMetaFlow(r.Context(), waba, token, name, categories)
		if err != nil {
			s.markFlowPublished(r.Context(), id, a.OrgID, "", flowJSON, err.Error())
			http.Error(w, err.Error(), http.StatusUnprocessableEntity)
			return
		}
	}
	if err := s.metaUploadFlowAsset(r.Context(), metaFlowID, token, []byte(flowJSON)); err != nil {
		s.markFlowPublished(r.Context(), id, a.OrgID, metaFlowID, flowJSON, err.Error())
		http.Error(w, err.Error(), http.StatusUnprocessableEntity)
		return
	}
	if _, err := s.metaPost(r.Context(), fmt.Sprintf("%s/%s/publish", graphBase, metaFlowID), token, map[string]any{}); err != nil {
		s.markFlowPublished(r.Context(), id, a.OrgID, metaFlowID, flowJSON, err.Error())
		http.Error(w, err.Error(), http.StatusUnprocessableEntity)
		return
	}
	s.markFlowPublished(r.Context(), id, a.OrgID, metaFlowID, flowJSON, "")
	s.audit(r.Context(), a, "published", "wa_flow", id, map[string]any{"meta_flow_id": metaFlowID})
	writeJSON(w, map[string]any{"status": "published", "meta_flow_id": metaFlowID})
}

func (s *server) markFlowPublished(ctx context.Context, id, orgID, metaFlowID, flowJSON, pubErr string) {
	status := "published"
	if pubErr != "" {
		status = "draft"
	}
	_, _ = s.pool.Exec(ctx,
		`UPDATE wa_flows SET status=$3,
		   meta_flow_id = COALESCE(NULLIF($4,''), meta_flow_id),
		   flow_json    = $5::jsonb,
		   publish_error= NULLIF($6,''),
		   updated_at   = now()
		 WHERE id=$1 AND organization_id=$2`,
		id, orgID, status, metaFlowID, flowJSON, pubErr)
}

// ── Send a published form to a contact ──────────────────────

func newFlowToken(flowID string) string {
	rb := make([]byte, 8)
	_, _ = rand.Read(rb)
	// "f-<flowUUID>-<rand>" so the nfm_reply webhook can recover the flow id.
	return "f-" + flowID + "-" + hex.EncodeToString(rb)
}

func flowIDFromToken(token string) string {
	parts := strings.Split(token, "-")
	// f - <8 uuid groups...> ; the uuid itself contains dashes, so rejoin.
	if len(parts) < 3 || parts[0] != "f" {
		return ""
	}
	return strings.Join(parts[1:len(parts)-1], "-")
}

// POST /api/wa-flows/{id}/send   Body: { "to": "<phone>", "cta": "Open form" }
func (s *server) handleSendFlow(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	id := r.PathValue("id")
	var body struct {
		To   string `json:"to"`
		CTA  string `json:"cta"`
		Body string `json:"body"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.To) == "" {
		http.Error(w, "to required", http.StatusBadRequest)
		return
	}

	var name, metaFlowID, status, channelID string
	err := s.pool.QueryRow(r.Context(),
		`SELECT name, COALESCE(meta_flow_id,''), status, COALESCE(channel_id::text,'')
		   FROM wa_flows WHERE id=$1 AND organization_id=$2`,
		id, a.OrgID).Scan(&name, &metaFlowID, &status, &channelID)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if status != "published" || metaFlowID == "" {
		http.Error(w, "form must be published before sending", http.StatusBadRequest)
		return
	}

	token := newFlowToken(id)
	if config.GetBool("WA_MOCK", true) {
		writeJSON(w, map[string]any{"status": "sent", "flow_token": token, "mock": true})
		return
	}

	_, pnid, accessToken, err := s.resolveFlowWABA(r.Context(), a.OrgID, channelID)
	if err != nil || pnid == "" {
		http.Error(w, "channel not ready to send", http.StatusBadRequest)
		return
	}
	cta := nz(body.CTA, "Open form")
	bodyText := nz(body.Body, name)
	payload := map[string]any{
		"messaging_product": "whatsapp",
		"to":                body.To,
		"type":              "interactive",
		"interactive": map[string]any{
			"type": "flow",
			"body": map[string]string{"text": bodyText},
			"action": map[string]any{
				"name": "flow",
				"parameters": map[string]any{
					"flow_message_version": "3",
					"flow_token":           token,
					"flow_id":              metaFlowID,
					"flow_cta":             cta,
					"flow_action":          "navigate",
				},
			},
		},
	}
	if _, err := s.metaPost(r.Context(), fmt.Sprintf("%s/%s/messages", graphBase, pnid), accessToken, payload); err != nil {
		http.Error(w, err.Error(), http.StatusUnprocessableEntity)
		return
	}
	writeJSON(w, map[string]any{"status": "sent", "flow_token": token})
}

// ── Responses ───────────────────────────────────────────────

// GET /api/wa-flows/responses?flow_id=&from=&to=
func (s *server) handleListFlowResponses(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	args := []any{a.OrgID}
	filter := ""
	if f := r.URL.Query().Get("flow_id"); f != "" {
		args = append(args, f)
		filter += fmt.Sprintf(" AND r.flow_id = $%d", len(args))
	}
	rows, err := s.queryMaps(r.Context(),
		fmt.Sprintf(`SELECT r.id::text AS id, r.flow_id::text AS flow_id, f.name AS flow_name,
		        r.contact_name, r.contact_phone, r.response, r.received_at
		   FROM wa_flow_responses r
		   LEFT JOIN wa_flows f ON f.id = r.flow_id
		  WHERE r.organization_id=$1%s
		  ORDER BY r.received_at DESC LIMIT 500`, filter), args...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, rows)
}

// GET /api/wa-flows/responses/export?flow_id= — CSV download.
func (s *server) handleExportFlowResponses(w http.ResponseWriter, r *http.Request) {
	a, _ := authFrom(r.Context())
	args := []any{a.OrgID}
	filter := ""
	if f := r.URL.Query().Get("flow_id"); f != "" {
		args = append(args, f)
		filter += fmt.Sprintf(" AND r.flow_id = $%d", len(args))
	}
	rows, err := s.queryMaps(r.Context(),
		fmt.Sprintf(`SELECT f.name AS flow_name, r.contact_name, r.contact_phone,
		        r.response, r.received_at
		   FROM wa_flow_responses r LEFT JOIN wa_flows f ON f.id=r.flow_id
		  WHERE r.organization_id=$1%s ORDER BY r.received_at DESC`, filter), args...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	// Union of all response field keys -> stable column order.
	fieldSet := map[string]bool{}
	for _, row := range rows {
		if m, ok := row["response"].(map[string]any); ok {
			for k := range m {
				fieldSet[k] = true
			}
		}
	}
	fields := make([]string, 0, len(fieldSet))
	for k := range fieldSet {
		fields = append(fields, k)
	}
	sort.Strings(fields)

	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", "attachment; filename=form-responses.csv")
	cw := csv.NewWriter(w)
	header := append([]string{"Form", "Contact", "Phone", "Received At"}, fields...)
	_ = cw.Write(header)
	for _, row := range rows {
		rec := []string{asStr(row["flow_name"]), asStr(row["contact_name"]), asStr(row["contact_phone"]), asStr(row["received_at"])}
		m, _ := row["response"].(map[string]any)
		for _, f := range fields {
			rec = append(rec, asStr(m[f]))
		}
		_ = cw.Write(rec)
	}
	cw.Flush()
}

func asStr(v any) string {
	switch t := v.(type) {
	case nil:
		return ""
	case string:
		return t
	case time.Time:
		return t.Format(time.RFC3339)
	case []any:
		parts := make([]string, len(t))
		for i, x := range t {
			parts[i] = asStr(x)
		}
		return strings.Join(parts, ", ")
	default:
		return fmt.Sprintf("%v", t)
	}
}

// captureFlowResponse stores an nfm_reply submission. Called from the webhook
// ingest with the raw response_json string (which embeds our flow_token).
func (s *server) captureFlowResponse(ctx context.Context, orgID, fromPhone, contactName, responseJSON string) {
	var parsed map[string]any
	if err := json.Unmarshal([]byte(responseJSON), &parsed); err != nil {
		s.log.Warn("nfm_reply: bad response_json", "err", err)
		return
	}
	flowToken, _ := parsed["flow_token"].(string)
	// Everything except the bookkeeping token is the customer's answers.
	answers := map[string]any{}
	for k, v := range parsed {
		if k == "flow_token" {
			continue
		}
		answers[k] = v
	}
	flowID := flowIDFromToken(flowToken)
	ansJSON, _ := json.Marshal(answers)

	// Resolve contact + latest conversation by phone (best effort).
	var contactID, convID *string
	_ = s.pool.QueryRow(ctx,
		`SELECT c.id::text, cv.id::text
		   FROM contacts c
		   LEFT JOIN conversations cv ON cv.contact_id=c.id
		  WHERE c.organization_id=$1 AND c.phone=$2
		  ORDER BY cv.last_message_at DESC NULLS LAST LIMIT 1`,
		orgID, fromPhone).Scan(&contactID, &convID)

	_, err := s.pool.Exec(ctx,
		`INSERT INTO wa_flow_responses
		   (organization_id, flow_id, flow_token, conversation_id, contact_id,
		    contact_name, contact_phone, response)
		 VALUES ($1, NULLIF($2,'')::uuid, $3, $4::uuid, $5::uuid, $6, $7, $8::jsonb)`,
		orgID, flowID, flowToken, convID, contactID, contactName, fromPhone, string(ansJSON))
	if err != nil {
		s.log.Error("nfm_reply: insert response failed", "err", err)
		return
	}
	s.log.Info("wa flow response captured", "org", orgID, "flow", flowID, "from", fromPhone)

	if flowID != "" {
		s.maybeAppendFlowSheet(ctx, orgID, flowID, contactName, fromPhone, answers)
	}
}

// maybeAppendFlowSheet appends the submission to the form's linked Google Sheet,
// if one is configured. Columns follow the form's input fields (stable order):
// Timestamp, Contact, Phone, then each field value. Best-effort.
func (s *server) maybeAppendFlowSheet(ctx context.Context, orgID, flowID, contactName, phone string, answers map[string]any) {
	var enabled bool
	var sheetID, sheetTab, defJSON string
	err := s.pool.QueryRow(ctx,
		`SELECT sheet_enabled, COALESCE(sheet_id,''), COALESCE(sheet_tab,'Sheet1'), definition::text
		   FROM wa_flows WHERE id=$1 AND organization_id=$2`,
		flowID, orgID).Scan(&enabled, &sheetID, &sheetTab, &defJSON)
	if err != nil || !enabled || sheetID == "" {
		return
	}
	var def flowDefinition
	_ = json.Unmarshal([]byte(defJSON), &def)
	row := []string{time.Now().Format("2006-01-02 15:04:05"), contactName, phone}
	for _, sc := range def.Screens {
		for _, c := range sc.Components {
			if c.Type == "heading" || c.Type == "body" || c.Type == "caption" || c.Name == "" {
				continue
			}
			row = append(row, asStr(answers[c.Name]))
		}
	}
	if err := s.appendSheetRow(ctx, sheetID, sheetTab, row); err != nil {
		s.log.Warn("flow -> google sheet append failed", "flow", flowID, "err", err)
	}
}
