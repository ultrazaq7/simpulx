package main

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"net/url"
	"strings"
	"time"

	"github.com/simpulx/v2/libs/go/config"
)

// ── Ads monitoring (rule-based) ──────────────────────────────────────────────
//
// Sweeps every campaign Simpulx manages ads for, evaluates four rules against
// real Meta metrics, records what it found in ads_alerts and emails a digest.
// Deliberately NOT LLM-driven: these are threshold comparisons, they must be
// reproducible, and an alert that costs a model call per campaign per six hours
// is an alert nobody will leave switched on.
//
// Thresholds resolve per campaign first (columns from migration 0108), falling
// back to env. NULL means "use the env value", so a fleet-wide retune is a
// one-line env edit and only deliberate overrides opt out of it.

type adsThresholds struct {
	fatigueFreq  float64
	minCTR       float64
	cplMultiple  float64
	overspendMul float64
}

type managedCampaign struct {
	id, orgID, name string
	accountID       string
	extAccountID    string
	token           string
	targetCPL       *float64
	monthlyBudget   *float64
	th              adsThresholds
}

// alert is one rule firing, before it is written or sent.
type alert struct {
	kind      string // fatigue | low_ctr | high_cpl | overspend
	adExtID   string // set when the rule is about one ad
	metric    float64
	threshold float64
	action    string // none | flagged | paused_ad | paused_campaign
	detail    string
}

func (s *server) startAdsMonitorCron(ctx context.Context) {
	hours := config.GetInt("ADS_MONITOR_INTERVAL_HOURS", 6)
	if hours < 1 {
		hours = 6
	}
	go func() {
		// Startup delay so a deploy is not immediately calling Meta, and so this
		// lands after the ad sync cron has had a chance to refresh metrics.
		t := time.NewTimer(5 * time.Minute)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				s.runAdsMonitor(ctx)
				t.Reset(time.Duration(hours) * time.Hour)
			}
		}
	}()
}

// adsMonitorLockKey is an arbitrary but fixed key for the advisory lock below.
const adsMonitorLockKey = 0x5ADC0DE1

// runAdsMonitor evaluates every managed campaign once.
//
// It takes a Postgres advisory lock first. The existing ad-sync cron runs inside
// the gateway process with no leader election, which is dormant only because
// prod runs a single instance; the moment the gateway is scaled, every replica
// runs it. That is survivable for a read-only sync (duplicate upserts) but NOT
// here, because this cron PAUSES things and sends mail. A session-level lock that
// is simply not taken by the losers is the cheapest correct answer.
func (s *server) runAdsMonitor(ctx context.Context) {
	conn, err := s.pool.Acquire(ctx)
	if err != nil {
		s.log.Warn("ads monitor: acquire failed", "err", err)
		return
	}
	defer conn.Release()

	var got bool
	if err := conn.QueryRow(ctx, `SELECT pg_try_advisory_lock($1)`, adsMonitorLockKey).Scan(&got); err != nil {
		s.log.Warn("ads monitor: lock failed", "err", err)
		return
	}
	if !got {
		s.log.Info("ads monitor: another instance holds the lock, skipping")
		return
	}
	defer func() {
		_, _ = conn.Exec(context.Background(), `SELECT pg_advisory_unlock($1)`, adsMonitorLockKey)
	}()

	camps, err := s.loadManagedCampaigns(ctx)
	if err != nil {
		s.log.Warn("ads monitor: load campaigns failed", "err", err)
		return
	}
	if len(camps) == 0 {
		return
	}
	for _, c := range camps {
		alerts := s.evaluateCampaign(ctx, c)
		if len(alerts) == 0 {
			continue
		}
		s.recordAndNotify(ctx, c, alerts)
	}
}

func (s *server) loadManagedCampaigns(ctx context.Context) ([]managedCampaign, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT c.id::text, c.organization_id::text, c.name,
		        aa.id::text, aa.external_account_id, COALESCE(aa.access_token,''),
		        c.target_cpl, c.monthly_budget,
		        c.ads_fatigue_freq, c.ads_min_ctr, c.ads_cpl_multiplier, c.ads_overspend_multiplier
		   FROM campaigns c
		   JOIN ad_accounts aa ON aa.id = c.managed_ad_account_id
		  WHERE c.managed_ad_account_id IS NOT NULL
		    AND aa.platform = 'meta'
		    AND aa.status = 'connected'`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// Env fallbacks, resolved once per sweep.
	envFreq := config.GetFloat("ADS_FATIGUE_FREQ", 3.5)
	envCTR := config.GetFloat("ADS_MIN_CTR", 0.01)
	envCPLMul := config.GetFloat("ADS_CPL_ALERT_MULTIPLIER", 2.0)
	envOverMul := config.GetFloat("ADS_OVERSPEND_MULTIPLIER", 1.2)

	var out []managedCampaign
	for rows.Next() {
		var c managedCampaign
		var encToken string
		var freq, ctr, cplMul, overMul *float64
		if err := rows.Scan(&c.id, &c.orgID, &c.name, &c.accountID, &c.extAccountID, &encToken,
			&c.targetCPL, &c.monthlyBudget, &freq, &ctr, &cplMul, &overMul); err != nil {
			continue
		}
		tok, err := decryptAdToken(encToken)
		if err != nil || tok == "" {
			s.log.Warn("ads monitor: no usable token", "campaign", c.name)
			continue
		}
		c.token = tok
		c.th = adsThresholds{
			fatigueFreq:  firstFloat(freq, envFreq),
			minCTR:       firstFloat(ctr, envCTR),
			cplMultiple:  firstFloat(cplMul, envCPLMul),
			overspendMul: firstFloat(overMul, envOverMul),
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func firstFloat(v *float64, fallback float64) float64 {
	if v != nil {
		return *v
	}
	return fallback
}

// adWindowRow is one ad's performance over the fatigue window.
type adWindowRow struct {
	adID, adName string
	impressions  int64
	clicks       int64
	spend        float64
	results      int64
	frequency    float64
}

// fetchAdWindow pulls per-ad insights over the last N days as ONE aggregated row
// per ad (no time_increment).
//
// This is the whole reason the fatigue rule needs its own call rather than
// reading ad_ad_metrics: that table is populated with time_increment=1, so its
// `frequency` is a PER-DAY figure, which sits near 1.0-1.5 almost always. A
// fatigue threshold of 3.5 compared against a daily frequency would never fire.
// Frequency over a window is not derivable from daily rows either, because reach
// is deduplicated across the window and summing daily reach double-counts people.
// So the window has to be asked for directly.
func fetchAdWindow(ctx context.Context, extAccountID, token string, days int) ([]adWindowRow, error) {
	until := time.Now().Format("2006-01-02")
	since := time.Now().AddDate(0, 0, -days).Format("2006-01-02")
	tr, _ := json.Marshal(map[string]string{"since": since, "until": until})
	q := url.Values{}
	q.Set("level", "ad")
	q.Set("fields", "ad_id,ad_name,impressions,reach,frequency,clicks,spend,actions")
	q.Set("time_range", string(tr))
	q.Set("limit", "500")
	q.Set("access_token", token)
	u := fmt.Sprintf("https://graph.facebook.com/%s/act_%s/insights?%s", metaGraphVersion, extAccountID, q.Encode())

	var payload struct {
		Data  []metaInsight `json:"data"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := metaGet(ctx, u, &payload); err != nil {
		return nil, err
	}
	if payload.Error != nil {
		return nil, fmt.Errorf("meta: %s", payload.Error.Message)
	}
	out := make([]adWindowRow, 0, len(payload.Data))
	for _, in := range payload.Data {
		if in.AdID == "" {
			continue
		}
		out = append(out, adWindowRow{
			adID: in.AdID, adName: in.AdName,
			impressions: atoiSafe(in.Impressions),
			clicks:      atoiSafe(in.Clicks),
			spend:       atofSafe(in.Spend),
			results:     metaResults(in),
			frequency:   atofSafe(in.Frequency),
		})
	}
	return out, nil
}

// evaluateCampaign runs the four rules and returns what fired.
func (s *server) evaluateCampaign(ctx context.Context, c managedCampaign) []alert {
	var alerts []alert
	windowDays := config.GetInt("ADS_FATIGUE_WINDOW_DAYS", 7)
	if windowDays < 1 {
		windowDays = 7
	}

	ads, err := fetchAdWindow(ctx, c.extAccountID, c.token, windowDays)
	if err != nil {
		s.log.Warn("ads monitor: window fetch failed", "campaign", c.name, "err", err)
		return nil
	}

	// ── Rule 1: creative fatigue, per ad ───────────────────────────────────
	// Only the WORST offender is paused per sweep. Pausing every fatigued ad at
	// once can silence a whole ad set and stop delivery entirely, which is a
	// bigger failure than the fatigue it was fixing.
	var worst *adWindowRow
	for i := range ads {
		a := &ads[i]
		if a.frequency <= c.th.fatigueFreq {
			continue
		}
		if worst == nil || a.frequency > worst.frequency {
			worst = a
		}
	}
	if worst != nil {
		act := "flagged"
		detail := fmt.Sprintf("Ad %q frequency %.2f over %dd (threshold %.2f)",
			adLabel(*worst), worst.frequency, windowDays, c.th.fatigueFreq)
		if s.pauseAdIfEnabled(ctx, c, worst.adID) {
			act = "paused_ad"
			detail += " - paused"
		}
		alerts = append(alerts, alert{
			kind: "fatigue", adExtID: worst.adID,
			metric: worst.frequency, threshold: c.th.fatigueFreq,
			action: act, detail: detail,
		})
	}

	// ── Rules 2 and 3 work on the campaign's totals over the window ─────────
	var imp, clicks, res int64
	var spend float64
	for _, a := range ads {
		imp += a.impressions
		clicks += a.clicks
		res += a.results
		spend += a.spend
	}

	// Rule 2: CTR. Skipped below a floor of impressions, because CTR on a handful
	// of impressions is noise and firing on it trains people to ignore alerts.
	const minImpressionsForCTR = 1000
	if imp >= minImpressionsForCTR {
		ctr := float64(clicks) / float64(imp)
		if ctr < c.th.minCTR {
			alerts = append(alerts, alert{
				kind: "low_ctr", metric: ctr, threshold: c.th.minCTR, action: "flagged",
				detail: fmt.Sprintf("CTR %.3f%% over %dd on %d impressions (threshold %.3f%%)",
					ctr*100, windowDays, imp, c.th.minCTR*100),
			})
		}
	}

	// Rule 3: CPL. Needs a target to compare against AND at least one result:
	// with zero results CPL is undefined, and treating it as infinite would fire
	// on every campaign in its first hours.
	if c.targetCPL != nil && *c.targetCPL > 0 && res > 0 {
		cpl := spend / float64(res)
		limit := *c.targetCPL * c.th.cplMultiple
		if cpl > limit {
			alerts = append(alerts, alert{
				kind: "high_cpl", metric: cpl, threshold: limit, action: "flagged",
				detail: fmt.Sprintf("CPL %s vs target %s (x%.1f = %s) over %dd",
					rupiah(cpl), rupiah(*c.targetCPL), c.th.cplMultiple, rupiah(limit), windowDays),
			})
		}
	}

	// ── Rule 4: overspend, on YESTERDAY's spend ────────────────────────────
	// Yesterday rather than today: a partial day always looks under budget, so
	// today's figure can never trigger this and would give false reassurance.
	if c.monthlyBudget != nil && *c.monthlyBudget > 0 {
		daily := *c.monthlyBudget / 30.0
		limit := daily * c.th.overspendMul
		if y, err := s.yesterdaySpend(ctx, c.id); err == nil && y > limit {
			act := "flagged"
			detail := fmt.Sprintf("Yesterday spend %s vs daily budget %s (x%.1f = %s)",
				rupiah(y), rupiah(daily), c.th.overspendMul, rupiah(limit))
			if s.pauseCampaignIfEnabled(ctx, c) {
				act = "paused_campaign"
				detail += " - campaign paused"
			}
			alerts = append(alerts, alert{
				kind: "overspend", metric: y, threshold: limit, action: act, detail: detail,
			})
		}
	}
	return alerts
}

func adLabel(a adWindowRow) string {
	if strings.TrimSpace(a.adName) != "" {
		return a.adName
	}
	return a.adID
}

// yesterdaySpend reads the already-synced daily rows rather than calling Meta
// again: ad_metrics is refreshed by the sync cron and yesterday is settled.
func (s *server) yesterdaySpend(ctx context.Context, campaignID string) (float64, error) {
	var spend float64
	err := s.pool.QueryRow(ctx,
		`SELECT COALESCE(sum(am.spend), 0)::float8
		   FROM ad_metrics am
		   JOIN ad_campaign_campaigns m ON m.ad_campaign_id = am.ad_campaign_id
		  WHERE m.campaign_id = $1::uuid AND am.date = (current_date - 1)`, campaignID).Scan(&spend)
	return spend, err
}

// ── Actions ─────────────────────────────────────────────────────────────────
//
// Pausing writes to a customer's live ad account, so it is OFF unless
// ADS_AUTOPAUSE=true. The rules have never run against live traffic (no campaign
// has been active since the metrics start), so shipping them switched on would
// mean the first real test of "should this stop spending" happens on a client's
// money. With the flag off the alert is still recorded and emailed with the
// action it WOULD have taken, which is what makes turning it on later a decision
// backed by evidence instead of a guess.

func autopauseEnabled() bool { return config.GetBool("ADS_AUTOPAUSE", false) }

func (s *server) pauseAdIfEnabled(ctx context.Context, c managedCampaign, adID string) bool {
	if !autopauseEnabled() {
		return false
	}
	if err := metaSetStatus(ctx, adID, c.token, "PAUSED"); err != nil {
		s.log.Warn("ads monitor: pause ad failed", "ad", adID, "err", err)
		return false
	}
	s.log.Info("ads monitor: ad paused", "ad", adID, "campaign", c.name)
	return true
}

func (s *server) pauseCampaignIfEnabled(ctx context.Context, c managedCampaign) bool {
	if !autopauseEnabled() {
		return false
	}
	var metaCampaignID string
	if err := s.pool.QueryRow(ctx,
		`SELECT COALESCE(meta_campaign_id,'') FROM campaigns WHERE id=$1`, c.id).Scan(&metaCampaignID); err != nil || metaCampaignID == "" {
		// Nothing we created; refuse to guess which Meta campaign is "the" one, as
		// an ad campaign can feed several of ours.
		return false
	}
	if err := metaSetStatus(ctx, metaCampaignID, c.token, "PAUSED"); err != nil {
		s.log.Warn("ads monitor: pause campaign failed", "campaign", c.name, "err", err)
		return false
	}
	s.log.Info("ads monitor: campaign paused", "campaign", c.name)
	return true
}

// metaSetStatus flips an ad or campaign object's status (ACTIVE | PAUSED).
func metaSetStatus(ctx context.Context, objectID, token, status string) error {
	form := url.Values{}
	form.Set("status", status)
	form.Set("access_token", token)
	u := fmt.Sprintf("https://graph.facebook.com/%s/%s", metaGraphVersion, objectID)
	return metaPostForm(ctx, u, form)
}

// ── Recording + notification ────────────────────────────────────────────────

func (s *server) recordAndNotify(ctx context.Context, c managedCampaign, alerts []alert) {
	var fresh []alert
	for _, al := range alerts {
		// Dedup: the same rule stays true for as long as the underlying problem
		// does, so without this a fatigued ad would email every sweep, forever.
		// Suppression is per (campaign, rule) and only for alerts that took no
		// action -- something we actually paused is worth saying again.
		var recent bool
		window := config.GetInt("ADS_ALERT_DEDUP_HOURS", 24)
		if err := s.pool.QueryRow(ctx,
			`SELECT EXISTS (SELECT 1 FROM ads_alerts
			                 WHERE campaign_id=$1::uuid AND alert_type=$2
			                   AND created_at > now() - make_interval(hours => $3))`,
			c.id, al.kind, window).Scan(&recent); err == nil && recent && al.action == "flagged" {
			continue
		}
		var id string
		if err := s.pool.QueryRow(ctx,
			`INSERT INTO ads_alerts (organization_id, campaign_id, ad_external_id, alert_type,
			                         metric_value, threshold_value, action_taken, detail)
			 VALUES ($1::uuid,$2::uuid,NULLIF($3,''),$4,$5,$6,$7,$8) RETURNING id::text`,
			c.orgID, c.id, al.adExtID, al.kind, al.metric, al.threshold, al.action, al.detail).Scan(&id); err != nil {
			s.log.Warn("ads monitor: record alert failed", "campaign", c.name, "err", err)
			continue
		}
		fresh = append(fresh, al)
	}
	if len(fresh) == 0 {
		return
	}

	to := strings.TrimSpace(config.Get("ADS_ALERT_EMAIL", ""))
	if to == "" {
		s.log.Warn("ads monitor: ADS_ALERT_EMAIL unset, alerts recorded but not sent", "campaign", c.name, "alerts", len(fresh))
		return
	}
	subj := fmt.Sprintf("[Simpulx Ads] %s - %d alert", c.name, len(fresh))
	if len(fresh) > 1 {
		subj += "s"
	}
	// mailer.Send returns sent=false with a NIL error when SMTP is not configured
	// (see libs/go/mailer). Checking only err would mark these as delivered when
	// nothing left the building, so the check is on `sent`.
	sent, err := s.sendMail(to, subj, adsAlertHTML(c.name, fresh))
	if err != nil || !sent {
		s.log.Warn("ads monitor: alert email NOT delivered", "campaign", c.name, "to", to, "sent", sent, "err", err)
		return
	}
	_, _ = s.pool.Exec(ctx,
		`UPDATE ads_alerts SET notified_at = now()
		  WHERE campaign_id=$1::uuid AND notified_at IS NULL`, c.id)
}

func adsAlertHTML(campaign string, alerts []alert) string {
	var b strings.Builder
	b.WriteString(`<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;color:#1a1a1a">`)
	b.WriteString(`<p style="margin:0 0 12px"><strong>` + html.EscapeString(campaign) + `</strong></p>`)
	b.WriteString(`<table cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:640px">`)
	for _, a := range alerts {
		icon := "&#128993;" // yellow: flagged
		if a.action == "paused_ad" || a.action == "paused_campaign" {
			icon = "&#128308;" // red: we acted
		}
		b.WriteString(`<tr style="border-bottom:1px solid #eee"><td style="width:28px">` + icon + `</td><td>`)
		b.WriteString(html.EscapeString(a.detail))
		b.WriteString(`</td></tr>`)
	}
	b.WriteString(`</table>`)
	if !autopauseEnabled() {
		b.WriteString(`<p style="margin:14px 0 0;color:#666;font-size:12.5px">` +
			`Auto-pause is OFF (ADS_AUTOPAUSE), so nothing was changed in Meta. ` +
			`The actions above are what would have been taken.</p>`)
	}
	b.WriteString(`</div>`)
	return b.String()
}

func rupiah(v float64) string {
	return "Rp " + humanInt(int64(v+0.5))
}

// humanInt formats with thousand separators, the Indonesian way (dots).
func humanInt(n int64) string {
	neg := n < 0
	if neg {
		n = -n
	}
	s := fmt.Sprintf("%d", n)
	var out []byte
	for i, c := range []byte(s) {
		if i > 0 && (len(s)-i)%3 == 0 {
			out = append(out, '.')
		}
		out = append(out, c)
	}
	if neg {
		return "-" + string(out)
	}
	return string(out)
}
