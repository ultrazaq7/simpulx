package main

import (
	"context"
	"time"
)

// Monthly AI-credit refill. Base credits do NOT roll over: each calendar month
// an active PAID subscription is topped back up to its monthly floor
// (quotas.base_credits) so an annual (prepaid) org gets its allowance every
// month automatically, without a manual re-credit. Design notes:
//
//   - FLOOR, not additive: we raise the quota only enough that
//     remaining (quota - used) >= base_credits. Unused base is NOT carried over
//     (non-rollover); a fresh month simply guarantees the floor again.
//   - Top-ups sit ON TOP: while a top-up keeps remaining above the floor, the
//     refill is a no-op; once top-ups run out and remaining dips below the floor,
//     the base kicks back in.
//   - renewal_date gates it exactly right: an ANNUAL sub (renewal ~12 months out)
//     refills every month of the year; a MONTHLY sub (renewal ~1 month out) only
//     refills within the month it paid for, then stops until it renews.
//   - Non-destructive: GREATEST() can only INCREASE the quota, never lower it, so
//     a bug can't wipe anyone's credits. base_refilled_month makes it run once
//     per org per month (idempotent).
func (s *server) startCreditRefillCron(ctx context.Context) {
	go func() {
		// Small startup delay so a deploy isn't doing billing writes immediately.
		t := time.NewTimer(4 * time.Minute)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				s.refillMonthlyBaseCredits(ctx)
				// Check a few times a day so the month rollover is picked up promptly;
				// the per-org monthly guard keeps it to one refill each.
				t.Reset(6 * time.Hour)
			}
		}
	}()
}

func (s *server) refillMonthlyBaseCredits(ctx context.Context) {
	tag, err := s.pool.Exec(ctx,
		`UPDATE org_subscriptions os
		    SET quotas = jsonb_set(
		                   jsonb_set(os.quotas, '{simpuler_credits}',
		                     to_jsonb(GREATEST(
		                       COALESCE((os.quotas->>'simpuler_credits')::int, 0),
		                       (SELECT COALESCE(sum(cc.used_credits),0)::int
		                          FROM campaign_credits cc
		                          JOIN campaigns c ON c.id = cc.campaign_id
		                         WHERE c.organization_id = os.organization_id)
		                       + (os.quotas->>'base_credits')::int))),
		                   '{base_refilled_month}', to_jsonb(to_char(now(),'YYYY-MM'))),
		        updated_at = now()
		  WHERE os.status = 'active'
		    AND COALESCE((os.quotas->>'base_credits')::int, 0) > 0
		    AND COALESCE(os.quotas->>'base_refilled_month','') <> to_char(now(),'YYYY-MM')
		    AND (os.renewal_date IS NULL OR os.renewal_date >= current_date)`)
	if err != nil {
		s.log.Error("monthly credit refill failed", "err", err)
		return
	}
	if n := tag.RowsAffected(); n > 0 {
		s.log.Info("monthly base credits refilled", "orgs", n)
	}
}
