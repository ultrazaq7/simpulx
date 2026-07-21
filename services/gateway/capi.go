package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Meta Conversions API (CAPI) for Click-to-WhatsApp.
//
// When a conversation reaches a funnel stage (qualified / appointment / test
// drive / booking / won) AND it originated from a CTWA ad click, migration 0102's
// DB trigger enqueues a row in capi_events. This drainer picks those rows up and
// POSTs a conversion event back to Meta so ad delivery optimizes toward leads that
// actually convert — the core growth lever for CTWA customers (lower cost per
// qualified lead, higher lead quality).
//
// Dormant until an org configures ad_accounts.capi_dataset_id: rows for orgs with
// no dataset are marked 'skipped', so the whole feature is a no-op until switched
// on. Single-instance like startAdSyncCron (no leader election yet — see P7).

// capiEventName maps our funnel stage system_key to a Meta standard conversion
// event. Verified against prod stages (2026-07-18): the funnel is
// qualified -> appointment -> test_drive(display "Negotiation") -> booking(display
// "Purchase"); there is NO "won" stage — `booking` IS the closing/sale. Kept in
// code (not the DB) so the mapping can be tuned without a migration.
// User decision (2026-07-18): optimize delivery on "Lead" (qualified). All events
// are still sent so Meta has the full funnel; the optimization event is chosen in
// Ads Manager.
func capiEventName(stageKey string) string {
	switch stageKey {
	case "qualified":
		return "Lead"
	case "appointment":
		return "Schedule"
	case "test_drive": // "Negotiation" in the UI
		return "InitiateCheckout"
	case "booking": // "Purchase" in the UI — the actual sale/closing
		return "Purchase"
	default:
		return ""
	}
}

const capiMaxAttempts = 5

// startCapiDrainCron runs the outbox drainer on a short tick.
func (s *server) startCapiDrainCron(ctx context.Context) {
	go func() {
		t := time.NewTimer(90 * time.Second) // startup delay, like startAdSyncCron
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				s.drainCapiEvents(ctx)
				t.Reset(2 * time.Minute)
			}
		}
	}()
}

type capiPending struct {
	id, org, convID, stageKey, clid string
	attempts                        int
}

// drainCapiEvents processes a batch of pending outbox rows. Each row resolves its
// org's Meta dataset + token independently; a row for an org without a configured
// dataset is marked 'skipped' (not retried).
func (s *server) drainCapiEvents(ctx context.Context) {
	rows, err := s.pool.Query(ctx,
		`SELECT id::text, organization_id::text, conversation_id::text, stage_key, ctwa_clid, attempts
		   FROM capi_events
		  WHERE status = 'pending'
		  ORDER BY created_at
		  LIMIT 100`)
	if err != nil {
		s.log.Warn("capi drain query failed", "err", err)
		return
	}
	var list []capiPending
	for rows.Next() {
		var p capiPending
		if err := rows.Scan(&p.id, &p.org, &p.convID, &p.stageKey, &p.clid, &p.attempts); err == nil {
			list = append(list, p)
		}
	}
	rows.Close()

	for _, p := range list {
		s.sendCapiEvent(ctx, p)
	}
}

// sendCapiEvent resolves config for the row's org and POSTs one conversion event.
func (s *server) sendCapiEvent(ctx context.Context, p capiPending) {
	eventName := capiEventName(p.stageKey)
	if eventName == "" {
		s.markCapi(ctx, p.id, "skipped", "unmapped stage_key")
		return
	}

	// Org's Meta ad account with CAPI configured. NULL dataset => dormant => skip.
	// Prefer the dedicated CAPI token; fall back to the ad-account token for
	// accounts where one credential covers both (migration 0110). The two are
	// issued separately in practice: CAPI tokens come from Events Manager scoped
	// to the dataset, ads tokens from the ad-account OAuth flow.
	var datasetID, encToken string
	err := s.pool.QueryRow(ctx,
		`SELECT capi_dataset_id, COALESCE(NULLIF(capi_access_token,''), access_token, '')
		   FROM ad_accounts
		  WHERE organization_id=$1 AND platform='meta'
		    AND capi_dataset_id IS NOT NULL AND capi_dataset_id <> ''
		    AND status='connected'
		  ORDER BY created_at LIMIT 1`, p.org).Scan(&datasetID, &encToken)
	if err != nil {
		// No configured Meta CAPI account for this org — feature off. Don't retry.
		s.markCapi(ctx, p.id, "skipped", "no capi_dataset_id configured")
		return
	}
	token, err := decryptAdToken(encToken)
	if err != nil || token == "" {
		s.bumpCapi(ctx, p, "token decrypt/empty")
		return
	}

	if err := postCapiConversion(ctx, datasetID, token, eventName, p.clid, p.id); err != nil {
		s.bumpCapi(ctx, p, err.Error())
		return
	}
	if _, err := s.pool.Exec(ctx,
		`UPDATE capi_events SET status='sent', attempts=attempts+1, sent_at=now(), last_error=NULL WHERE id=$1`,
		p.id); err != nil {
		s.log.Warn("capi mark sent failed", "id", p.id, "err", err)
	} else {
		s.log.Info("capi event sent", "event", eventName, "conv", p.convID)
	}
}

// bumpCapi records a failed attempt; after capiMaxAttempts the row is parked as
// 'failed' (an operator can inspect/retry via the outbox) instead of looping.
func (s *server) bumpCapi(ctx context.Context, p capiPending, reason string) {
	status := "pending"
	if p.attempts+1 >= capiMaxAttempts {
		status = "failed"
	}
	if _, err := s.pool.Exec(ctx,
		`UPDATE capi_events SET status=$2, attempts=attempts+1, last_error=$3 WHERE id=$1`,
		p.id, status, reason); err != nil {
		s.log.Warn("capi bump failed", "id", p.id, "err", err)
	}
}

func (s *server) markCapi(ctx context.Context, id, status, reason string) {
	if _, err := s.pool.Exec(ctx,
		`UPDATE capi_events SET status=$2, attempts=attempts+1, last_error=$3 WHERE id=$1`,
		id, status, reason); err != nil {
		s.log.Warn("capi mark failed", "id", id, "status", status, "err", err)
	}
}

// postCapiConversion POSTs one CTWA conversion event to the Meta dataset. The
// event uses action_source=business_messaging + messaging_channel=whatsapp with
// the ctwa_clid in user_data, which is how Meta attributes a business-messaging
// conversion back to the originating ad click. event_id (our outbox row id) lets
// Meta dedupe if a retry double-sends.
func postCapiConversion(ctx context.Context, datasetID, token, eventName, ctwaClid, eventID string) error {
	payload := map[string]any{
		"data": []map[string]any{{
			"event_name":        eventName,
			"event_time":        time.Now().Unix(),
			"event_id":          eventID,
			"action_source":     "business_messaging",
			"messaging_channel": "whatsapp",
			"user_data": map[string]any{
				"ctwa_clid": ctwaClid,
			},
		}},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("capi marshal: %w", err)
	}
	url := fmt.Sprintf("https://graph.facebook.com/%s/%s/events?access_token=%s",
		metaGraphVersion, datasetID, token)
	reqCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("capi post: %w", err)
	}
	defer resp.Body.Close()
	rb, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode/100 != 2 {
		return fmt.Errorf("capi http %d: %s", resp.StatusCode, string(rb))
	}
	return nil
}
