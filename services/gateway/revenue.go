package main

import (
	"net/http"
	"strings"
	"time"
)

// Platform revenue analytics for the super-admin dashboard: MRR-style totals,
// revenue by product type (Bundle vs AI Kredit), a monthly trend, subscription
// health (active / trial / expired), and churn — all from platform_transactions
// + org_subscriptions. Read-only; scoped to super admin by the route.

// GET /api/platform/revenue?from=YYYY-MM-DD&to=YYYY-MM-DD
func (s *server) handleRevenue(w http.ResponseWriter, r *http.Request) {
	from := strings.TrimSpace(r.URL.Query().Get("from"))
	to := strings.TrimSpace(r.URL.Query().Get("to"))
	// No range = all time (the picker's default), not an implicit window — an
	// unbounded floor keeps the same query shape without a special case.
	if to == "" {
		to = time.Now().Format("2006-01-02")
	}
	if from == "" {
		from = "1970-01-01"
	}

	// Revenue is recognised on APPROVAL (decided_at), the moment money is agreed.
	// The range is inclusive of `to` (< to+1 day).
	rangeWhere := `status='approved' AND decided_at >= $1::date AND decided_at < ($2::date + 1)`
	// Optional product filter: bundle (signup) or ai_credit (topup). Anything else
	// means "all", so a bad value can't silently return an empty report.
	switch r.URL.Query().Get("type") {
	case "bundle":
		rangeWhere += ` AND type='signup'`
	case "ai_credit":
		rangeWhere += ` AND type='topup'`
	}

	// KPI cards: total revenue in range, split by product type, plus deal counts.
	kpi, err := s.queryMaps(r.Context(),
		`SELECT
		    COALESCE(sum(amount),0)::float8                                              AS revenue,
		    COALESCE(sum(amount) FILTER (WHERE type='signup'),0)::float8                 AS revenue_bundle,
		    COALESCE(sum(amount) FILTER (WHERE type='topup'),0)::float8                  AS revenue_ai_credit,
		    count(*) FILTER (WHERE type='signup')                                        AS bundles,
		    count(*) FILTER (WHERE type='topup')                                         AS ai_credits,
		    count(*) FILTER (WHERE type='signup' AND package_name<>'trial')              AS paid_signups,
		    count(*) FILTER (WHERE type='signup' AND package_name='trial')               AS trials_started,
		    COALESCE(sum(credits) FILTER (WHERE type='topup'),0)                         AS credits_sold
		   FROM platform_transactions
		  WHERE `+rangeWhere, from, to)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Monthly revenue trend (by approval month), split by type for a stacked chart.
	trend, err := s.queryMaps(r.Context(),
		`SELECT to_char(date_trunc('month', decided_at), 'YYYY-MM') AS month,
		        COALESCE(sum(amount) FILTER (WHERE type='signup'),0)::float8 AS bundle,
		        COALESCE(sum(amount) FILTER (WHERE type='topup'),0)::float8  AS ai_credit,
		        COALESCE(sum(amount),0)::float8 AS total
		   FROM platform_transactions
		  WHERE `+rangeWhere+`
		  GROUP BY 1 ORDER BY 1`, from, to)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Subscription health snapshot (current, not range-bound): the recurring base.
	health, err := s.queryMaps(r.Context(),
		`SELECT
		    count(*) FILTER (WHERE status='active')                                      AS active,
		    count(*) FILTER (WHERE status='trial')                                       AS trial,
		    count(*) FILTER (WHERE status='active' AND renewal_date < current_date)      AS expired,
		    count(*) FILTER (WHERE status='active' AND renewal_date >= current_date
		                      AND renewal_date < current_date + 7)                       AS expiring_soon
		   FROM org_subscriptions`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Churn signals in range: subscriptions that lapsed (renewal passed) and
	// requests that were rejected (lost deals). Trial->paid conversion rate too.
	churn, err := s.queryMaps(r.Context(),
		`SELECT
		    (SELECT count(*) FROM org_subscriptions
		      WHERE status='active' AND renewal_date >= $1::date AND renewal_date < ($2::date + 1)
		        AND renewal_date < current_date)                                         AS lapsed,
		    (SELECT count(*) FROM platform_transactions
		      WHERE status='rejected' AND decided_at >= $1::date AND decided_at < ($2::date + 1)) AS rejected`,
		from, to)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Top orgs by spend in range — who's driving revenue.
	topOrgs, _ := s.queryMaps(r.Context(),
		`SELECT COALESCE(o.name, t.org_name, t.contact_email) AS org,
		        COALESCE(sum(t.amount),0)::float8 AS revenue,
		        count(*) AS deals
		   FROM platform_transactions t
		   LEFT JOIN organizations o ON o.id = t.organization_id
		  WHERE `+strings.ReplaceAll(rangeWhere, "status", "t.status")+`
		  GROUP BY 1 ORDER BY 2 DESC LIMIT 8`, from, to)

	one := func(rows []map[string]any) map[string]any {
		if len(rows) > 0 {
			return rows[0]
		}
		return map[string]any{}
	}
	writeJSON(w, map[string]any{
		"from":     from,
		"to":       to,
		"kpi":      one(kpi),
		"trend":    trend,
		"health":   one(health),
		"churn":    one(churn),
		"top_orgs": topOrgs,
	})
}
