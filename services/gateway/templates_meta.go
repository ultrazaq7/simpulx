package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/simpulx/v2/libs/go/config"
)

// ── Submit a template to Meta + handle the approval webhook ──────────────────
// Standard templates (TEXT/MEDIA header + body + footer + buttons) are built into
// Meta's component shape and POSTed to /{waba_id}/message_templates. Media headers
// are uploaded via the resumable upload API to obtain the required header_handle
// (needs META_APP_ID). Carousel / call-permission / contact-request types are not
// auto-registered yet (kept as drafts).

type templateButtonJSON struct {
	Type  string `json:"type"`
	Text  string `json:"text"`
	URL   string `json:"url"`
	Phone string `json:"phone"`
}

// submitTemplateToMeta builds the Meta payload, POSTs it, and returns (status, metaID).
func (s *server) submitTemplateToMeta(ctx context.Context, orgID, templateID string) (string, string, error) {
	var name, category, language, headerType, body, templateType string
	var headerText, footer, headerMediaURL, channelID sql.NullString
	var buttonsRaw, variablesRaw []byte
	err := s.pool.QueryRow(ctx,
		`SELECT name, category, language, COALESCE(header_type,'NONE'), header_text, body, footer,
		        buttons, variables, template_type, header_media_url, channel_id::text
		   FROM message_templates WHERE id=$1 AND organization_id=$2`,
		templateID, orgID,
	).Scan(&name, &category, &language, &headerType, &headerText, &body, &footer,
		&buttonsRaw, &variablesRaw, &templateType, &headerMediaURL, &channelID)
	if err != nil {
		return "", "", fmt.Errorf("template not found")
	}

	if templateType == "carousel" {
		return "", "", fmt.Errorf("carousel templates can't be auto-registered with Meta yet; keep it as a draft")
	}
	// Meta requires call-permission requests to be MARKETING templates.
	if templateType == "call_permission" {
		category = "MARKETING"
	}

	wabaID, token, err := s.templateWABA(ctx, orgID, channelID.String)
	if err != nil {
		return "", "", fmt.Errorf("no WhatsApp channel with a WABA id + access token to submit to (assign a channel to this template)")
	}

	var buttons []templateButtonJSON
	_ = json.Unmarshal(orEmptyJSON(buttonsRaw), &buttons)
	var variables []string
	_ = json.Unmarshal(orEmptyJSON(variablesRaw), &variables)

	comps, err := s.buildMetaComponents(ctx, token, headerType, headerText.String, headerMediaURL.String, body, footer.String, buttons, variables, templateType)
	if err != nil {
		return "", "", err
	}

	payload := map[string]any{
		"name": name, "language": language, "category": category, "components": comps,
	}
	respBody, err := s.metaPost(ctx, fmt.Sprintf("%s/%s/message_templates", graphBase, wabaID), token, payload)
	if err != nil {
		return "", "", err
	}
	var out struct {
		ID     string `json:"id"`
		Status string `json:"status"`
	}
	_ = json.Unmarshal(respBody, &out)
	status := strings.ToUpper(out.Status)
	if status == "" {
		status = "PENDING"
	}
	return status, out.ID, nil
}

// templateWABA resolves the WABA id + access token for a template: its own
// channel if set, otherwise the org's first active channel that has a WABA id.
func (s *server) templateWABA(ctx context.Context, orgID, channelID string) (string, string, error) {
	var waba, token string
	var err error
	if channelID != "" {
		err = s.pool.QueryRow(ctx,
			`SELECT COALESCE(waba_id,''), COALESCE(access_token,'') FROM channels WHERE id=$1 AND organization_id=$2`,
			channelID, orgID).Scan(&waba, &token)
	} else {
		err = s.pool.QueryRow(ctx,
			`SELECT COALESCE(waba_id,''), COALESCE(access_token,'') FROM channels
			  WHERE organization_id=$1 AND is_active AND waba_id IS NOT NULL AND waba_id<>''
			  ORDER BY created_at LIMIT 1`, orgID).Scan(&waba, &token)
	}
	if err != nil || waba == "" || token == "" {
		return "", "", fmt.Errorf("no WhatsApp channel with a WABA id + access token")
	}
	return waba, token, nil
}

// deleteTemplateFromMeta removes a template (all languages) from the WABA by name.
func (s *server) deleteTemplateFromMeta(ctx context.Context, wabaID, token, name string) error {
	u := fmt.Sprintf("%s/%s/message_templates?name=%s", graphBase, wabaID, url.QueryEscape(name))
	req, _ := http.NewRequestWithContext(ctx, http.MethodDelete, u, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return fmt.Errorf("meta delete %d: %s", resp.StatusCode, string(b))
	}
	return nil
}

// buildMetaComponents maps our flat template fields into Meta's components array.
func (s *server) buildMetaComponents(ctx context.Context, token, headerType, headerText, headerMediaURL, body, footer string, buttons []templateButtonJSON, variables []string, templateType string) ([]map[string]any, error) {
	var comps []map[string]any

	switch strings.ToUpper(headerType) {
	case "", "NONE":
	case "TEXT":
		h := map[string]any{"type": "HEADER", "format": "TEXT", "text": headerText}
		if nums := placeholdersIn(headerText); len(nums) > 0 {
			h["example"] = map[string]any{"header_text": pickVars(variables, nums)}
		}
		comps = append(comps, h)
	case "IMAGE", "VIDEO", "DOCUMENT":
		appID := config.Get("META_APP_ID", "")
		if appID == "" {
			return nil, fmt.Errorf("media headers need META_APP_ID set on the server to upload the sample to Meta")
		}
		if headerMediaURL == "" {
			return nil, fmt.Errorf("upload a sample %s for the header first", strings.ToLower(headerType))
		}
		handle, err := s.metaUploadHeaderHandle(ctx, appID, token, headerMediaURL)
		if err != nil {
			return nil, fmt.Errorf("header media upload to Meta failed: %w", err)
		}
		comps = append(comps, map[string]any{
			"type": "HEADER", "format": strings.ToUpper(headerType),
			"example": map[string]any{"header_handle": []string{handle}},
		})
	}

	bodyComp := map[string]any{"type": "BODY", "text": body}
	if nums := placeholdersIn(body); len(nums) > 0 {
		bodyComp["example"] = map[string]any{"body_text": [][]string{pickVars(variables, nums)}}
	}
	comps = append(comps, bodyComp)

	if footer != "" {
		comps = append(comps, map[string]any{"type": "FOOTER", "text": footer})
	}

	switch templateType {
	case "call_permission":
		// A dedicated top-level component; Meta renders the Allow / Don't allow UI.
		comps = append(comps, map[string]any{"type": "CALL_PERMISSION_REQUEST"})
	case "request_contact":
		comps = append(comps, map[string]any{"type": "BUTTONS", "buttons": []map[string]any{
			{"type": "REQUEST_CONTACT_INFO", "text": "Share contact info"},
		}})
	default:
		if len(buttons) > 0 {
			var btns []map[string]any
			for _, b := range buttons {
				if b.Text == "" {
					continue
				}
				switch strings.ToUpper(b.Type) {
				case "URL":
					btns = append(btns, map[string]any{"type": "URL", "text": b.Text, "url": b.URL})
				case "PHONE_NUMBER":
					btns = append(btns, map[string]any{"type": "PHONE_NUMBER", "text": b.Text, "phone_number": b.Phone})
				default:
					btns = append(btns, map[string]any{"type": "QUICK_REPLY", "text": b.Text})
				}
			}
			if len(btns) > 0 {
				comps = append(comps, map[string]any{"type": "BUTTONS", "buttons": btns})
			}
		}
	}
	return comps, nil
}

// metaUploadHeaderHandle uploads the sample media via the resumable upload API and
// returns the handle used in a template's media-header example.
func (s *server) metaUploadHeaderHandle(ctx context.Context, appID, token, mediaURL string) (string, error) {
	data, ct, err := s.fetchURL(ctx, mediaURL)
	if err != nil {
		return "", err
	}
	// 1) Create an upload session.
	sessURL := fmt.Sprintf("%s/%s/uploads?file_length=%d&file_type=%s", graphBase, appID, len(data), url.QueryEscape(ct))
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, sessURL, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	b, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("upload session %d: %s", resp.StatusCode, string(b))
	}
	var sess struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(b, &sess)
	if sess.ID == "" {
		return "", fmt.Errorf("no upload session id")
	}
	// 2) Upload the bytes.
	req2, _ := http.NewRequestWithContext(ctx, http.MethodPost, fmt.Sprintf("%s/%s", graphBase, sess.ID), bytes.NewReader(data))
	req2.Header.Set("Authorization", "OAuth "+token)
	req2.Header.Set("file_offset", "0")
	resp2, err := s.httpClient.Do(req2)
	if err != nil {
		return "", err
	}
	b2, _ := io.ReadAll(resp2.Body)
	resp2.Body.Close()
	if resp2.StatusCode >= 300 {
		return "", fmt.Errorf("upload bytes %d: %s", resp2.StatusCode, string(b2))
	}
	var h struct {
		H string `json:"h"`
	}
	_ = json.Unmarshal(b2, &h)
	if h.H == "" {
		return "", fmt.Errorf("no upload handle returned")
	}
	return h.H, nil
}

func (s *server) fetchURL(ctx context.Context, u string) ([]byte, string, error) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return nil, "", fmt.Errorf("fetch media %d", resp.StatusCode)
	}
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, "", err
	}
	ct := resp.Header.Get("Content-Type")
	if ct == "" {
		ct = "application/octet-stream"
	}
	return data, ct, nil
}

// processTemplateStatusWebhook handles "message_template_status_update": flips our
// template's status (APPROVED/REJECTED) by matching meta_template_id.
func (s *server) processTemplateStatusWebhook(ctx context.Context, val waValue) {
	metaID := val.MessageTemplateID.String()
	if metaID == "" {
		return
	}
	var status string
	switch strings.ToUpper(val.Event) {
	case "APPROVED":
		status = "APPROVED"
	case "REJECTED", "FLAGGED":
		status = "REJECTED"
	default:
		s.log.Info("template status webhook ignored", "event", val.Event, "meta_id", metaID)
		return
	}
	tag, err := s.pool.Exec(ctx,
		`UPDATE message_templates SET status=$2, rejected_reason=NULLIF($3,''), updated_at=now()
		  WHERE meta_template_id=$1`, metaID, status, val.Reason)
	if err != nil {
		s.log.Error("template status update failed", "err", err)
		return
	}
	s.log.Info("template status updated", "meta_id", metaID, "status", status, "rows", tag.RowsAffected())
}

// ── helpers ──
var placeholderRe = regexp.MustCompile(`\{\{(\d+)\}\}`)

func placeholdersIn(s string) []int {
	seen := map[int]bool{}
	var nums []int
	for _, g := range placeholderRe.FindAllStringSubmatch(s, -1) {
		n, _ := strconv.Atoi(g[1])
		if !seen[n] {
			seen[n] = true
			nums = append(nums, n)
		}
	}
	sort.Ints(nums)
	return nums
}

func pickVars(vars []string, nums []int) []string {
	out := make([]string, 0, len(nums))
	for _, n := range nums {
		if n-1 >= 0 && n-1 < len(vars) && vars[n-1] != "" {
			out = append(out, vars[n-1])
		} else {
			out = append(out, "Sample")
		}
	}
	return out
}

func orEmptyJSON(b []byte) []byte {
	if len(b) == 0 {
		return []byte("[]")
	}
	return b
}
