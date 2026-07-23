package main

import (
	"context"
	"fmt"
	"time"
)

// ── Low-credit alerts (emailed to the org owner) ──────────────────────────────
// A background worker warns the org owner before Simpuler credits run out, at two
// levels:
//   org pool  -> monthly bot-reply usage nears the org's simpuler_credits quota.
//   campaign  -> a campaign's remaining allocation drops to its low_balance_threshold.
// Both alerts go to the org owner (they and the admin are who top up credits).
// Dedup is via low_credit_alerted_at columns so the owner gets one email per
// episode, not one per tick (see migration 0101).

// orgAlertRatio: fraction of the monthly quota consumed before we warn the owner.
const orgAlertRatio = 0.9

func (s *server) startCreditAlertCron(ctx context.Context) {
	go func() {
		// Startup delay so a fresh deploy isn't immediately doing email work.
		t := time.NewTimer(3 * time.Minute)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				s.checkOrgCreditAlerts(ctx)
				s.checkCampaignCreditAlerts(ctx)
				t.Reset(30 * time.Minute)
			}
		}
	}()
}

// checkOrgCreditAlerts emails the owner of every active org whose monthly
// Simpuler usage has crossed orgAlertRatio of its quota, once per month.
func (s *server) checkOrgCreditAlerts(ctx context.Context) {
	rows, err := s.pool.Query(ctx,
		`SELECT os.organization_id::text, o.name,
		        (os.quotas->>'simpuler_credits')::int AS quota,
		        (SELECT count(*) FROM messages m
		           WHERE m.organization_id = os.organization_id
		             AND m.sender_type = 'bot'
		             AND m.created_at >= date_trunc('month', now())) AS used,
		        (SELECT u.email FROM users u
		           WHERE u.organization_id = os.organization_id
		             AND u.role = 'owner' AND u.status = 'active'
		           ORDER BY u.created_at LIMIT 1) AS owner_email
		   FROM org_subscriptions os
		   JOIN organizations o ON o.id = os.organization_id
		  WHERE os.status = 'active'
		    AND (os.quotas->>'simpuler_credits')::int > 0
		    AND (os.low_credit_alerted_at IS NULL
		         OR os.low_credit_alerted_at < date_trunc('month', now()))`)
	if err != nil {
		s.log.Warn("org credit alert query failed", "err", err)
		return
	}
	type org struct {
		id, name, ownerEmail string
		quota, used          int
	}
	var list []org
	for rows.Next() {
		var o org
		var ownerEmail *string
		if err := rows.Scan(&o.id, &o.name, &o.quota, &o.used, &ownerEmail); err == nil {
			if ownerEmail != nil {
				o.ownerEmail = *ownerEmail
			}
			list = append(list, o)
		}
	}
	rows.Close()

	for _, o := range list {
		if o.quota <= 0 || float64(o.used) < orgAlertRatio*float64(o.quota) {
			continue
		}
		if o.ownerEmail == "" {
			s.log.Warn("org low on credits but no owner email", "org", o.id, "used", o.used, "quota", o.quota)
			continue
		}
		remaining := o.quota - o.used
		if remaining < 0 {
			remaining = 0
		}
		subj := "Simpulx: your organization is running low on AI credits"
		_, mailErr := s.sendMail(o.ownerEmail, subj, orgCreditAlertHTML(o.name, o.used, o.quota, remaining))
		if mailErr != nil {
			s.log.Error("org credit alert email failed", "org", o.id, "err", mailErr)
			continue // leave alerted_at unset so we retry next tick
		}
		if _, err := s.pool.Exec(ctx,
			`UPDATE org_subscriptions SET low_credit_alerted_at = now() WHERE organization_id = $1`, o.id); err != nil {
			s.log.Error("org credit alert dedup update failed", "org", o.id, "err", err)
		}
		s.log.Info("org low-credit alert sent", "org", o.id, "used", o.used, "quota", o.quota)
	}
}

// checkCampaignCreditAlerts emails the org owner once per draining episode for
// each active campaign whose remaining allocation has dropped to its threshold.
func (s *server) checkCampaignCreditAlerts(ctx context.Context) {
	// Re-arm campaigns that were topped back up above their threshold, so the
	// next time they drain the owner gets a fresh alert.
	if _, err := s.pool.Exec(ctx,
		`UPDATE campaign_credits SET low_credit_alerted_at = NULL
		  WHERE low_credit_alerted_at IS NOT NULL
		    AND (allocated_credits - used_credits) > low_balance_threshold`); err != nil {
		s.log.Warn("campaign credit alert re-arm failed", "err", err)
	}

	rows, err := s.pool.Query(ctx,
		`SELECT cc.campaign_id::text, c.name, c.organization_id::text,
		        (cc.allocated_credits - cc.used_credits) AS remaining,
		        cc.low_balance_threshold,
		        (SELECT u.email FROM users u
		           WHERE u.organization_id = c.organization_id
		             AND u.role = 'owner' AND u.status = 'active'
		           ORDER BY u.created_at LIMIT 1) AS owner_email
		   FROM campaign_credits cc
		   JOIN campaigns c ON c.id = cc.campaign_id
		  WHERE c.status = 'active'
		    AND cc.allocated_credits > 0
		    AND cc.low_credit_alerted_at IS NULL
		    AND (cc.allocated_credits - cc.used_credits) <= cc.low_balance_threshold`)
	if err != nil {
		s.log.Warn("campaign credit alert query failed", "err", err)
		return
	}
	type camp struct {
		id, name, orgID, ownerEmail string
		remaining, threshold        int
	}
	var list []camp
	for rows.Next() {
		var c camp
		var ownerEmail *string
		if err := rows.Scan(&c.id, &c.name, &c.orgID, &c.remaining, &c.threshold, &ownerEmail); err == nil {
			if ownerEmail != nil {
				c.ownerEmail = *ownerEmail
			}
			list = append(list, c)
		}
	}
	rows.Close()

	for _, c := range list {
		if c.ownerEmail == "" {
			s.log.Warn("campaign low on credits but no owner email", "campaign", c.id, "remaining", c.remaining)
			continue
		}
		if c.remaining < 0 {
			c.remaining = 0
		}
		subj := "Simpulx: campaign \"" + c.name + "\" is low on AI credits"
		_, mailErr := s.sendMail(c.ownerEmail, subj, campaignCreditAlertHTML(c.name, c.remaining, c.threshold))
		if mailErr != nil {
			s.log.Error("campaign credit alert email failed", "campaign", c.id, "err", mailErr)
			continue // leave alerted_at unset so we retry next tick
		}
		if _, err := s.pool.Exec(ctx,
			`UPDATE campaign_credits SET low_credit_alerted_at = now() WHERE campaign_id = $1`, c.id); err != nil {
			s.log.Error("campaign credit alert dedup update failed", "campaign", c.id, "err", err)
		}
		s.log.Info("campaign low-credit alert sent", "campaign", c.id, "remaining", c.remaining)
	}
}

func orgCreditAlertHTML(orgName string, used, quota, remaining int) string {
	if orgName == "" {
		orgName = "your organization"
	}
	pct := 0
	if quota > 0 {
		pct = used * 100 / quota
	}
	return fmt.Sprintf(`<div style="font-family:Arial,Helvetica,sans-serif;padding:28px;color:#1a1a1a">
  <h2 style="margin:0 0 8px">AI credits running low</h2>
  <p style="color:#555;font-size:14px;line-height:1.6"><b>%s</b> has used <b>%d</b> of <b>%d</b> AI reply credits this month (%d%%). About <b>%d</b> credits remain.</p>
  <p style="color:#555;font-size:14px;line-height:1.6">When the pool runs out, the AI assistant stops replying and conversations fall back to your human agents. Top up or raise the quota to keep the assistant running.</p>
  <p style="margin:24px 0">
    <a href="%s/settings/billing" style="background:#0E5B54;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;display:inline-block">Review credits</a>
  </p>
  <p style="color:#888;font-size:12px;margin-top:24px">You are receiving this because you are the account owner.</p>
</div>`, orgName, used, quota, pct, remaining, appBaseURL())
}

func campaignCreditAlertHTML(campaignName string, remaining, threshold int) string {
	return fmt.Sprintf(`<div style="font-family:Arial,Helvetica,sans-serif;padding:28px;color:#1a1a1a">
  <h2 style="margin:0 0 8px">Campaign AI credits running low</h2>
  <p style="color:#555;font-size:14px;line-height:1.6">The campaign <b>%s</b> has only <b>%d</b> AI reply credits left (alert threshold: %d).</p>
  <p style="color:#555;font-size:14px;line-height:1.6">When this campaign's allocation hits zero, its AI assistant stops replying and leads fall back to human agents. Allocate more credits to keep it running.</p>
  <p style="margin:24px 0">
    <a href="%s/settings/campaigns" style="background:#0E5B54;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;display:inline-block">Manage campaign credits</a>
  </p>
  <p style="color:#888;font-size:12px;margin-top:24px">You are receiving this because you are the account owner.</p>
</div>`, campaignName, remaining, threshold, appBaseURL())
}
