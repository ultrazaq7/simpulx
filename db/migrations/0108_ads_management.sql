-- +goose Up
-- Ads Management: Simpulx runs a client's Meta ads end-to-end (create, monitor,
-- auto-pause, report) instead of only READING their spend.
--
-- Everything before this migration is read-only reporting (0046 ad_accounts /
-- ad_campaigns / ad_metrics, 0069 ad_ad_metrics, 0070 ad_creatives, 0084 the
-- ad_campaign -> campaign map). Those tables are REUSED as-is: this migration
-- deliberately does NOT add an `ads_metrics` or `ads_creative_metrics` table,
-- because ad_metrics (daily, per ad campaign) and ad_ad_metrics (daily, per ad =
-- per creative) already hold exactly that shape and are already populated by the
-- sync cron. Nor does it add a monthly budget column: campaigns.monthly_budget
-- has existed since 0091.
--
-- What is genuinely new here:
--   1. a campaign can be flagged as MANAGED by Simpulx (managed_ad_account_id)
--   2. per-campaign monitoring thresholds + a CPL target to judge them against
--   3. `frequency`, which the rule engine needs and no sync has ever pulled
--   4. ads_alerts       - an audit log of every rule firing and action taken
--   5. campaign_creatives - client-supplied assets we push to Meta

-- ── 1-2. Campaign-level ads management config ───────────────────────────────
--
-- managed_ad_account_id is a FK into OUR ad_accounts table, not a raw Meta act
-- id. ad_accounts is where the (encrypted) token lives, so the FK is what lets
-- the writer resolve "which credentials do I act with" from a campaign alone.
-- NULL = not managed by us; the campaign still reports spend exactly as before.
--
-- The four threshold columns are all NULLable ON PURPOSE. NULL means "use the
-- env default" (ADS_FATIGUE_FREQ / ADS_MIN_CTR / ADS_CPL_ALERT_MULTIPLIER /
-- ADS_OVERSPEND_MULTIPLIER), so a fleet-wide tuning change stays a one-line env
-- edit and only campaigns that were deliberately overridden opt out of it. A
-- NOT NULL DEFAULT would silently freeze today's defaults into every existing
-- row and make that impossible to tell apart from a real override.
ALTER TABLE campaigns
    ADD COLUMN IF NOT EXISTS managed_ad_account_id    uuid REFERENCES ad_accounts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS target_cpl               numeric,         -- currency-agnostic; compared against ad_metrics spend/results
    ADD COLUMN IF NOT EXISTS ads_report_enabled       boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS ads_fatigue_freq         numeric,         -- override: frequency above which an ad is fatigued
    ADD COLUMN IF NOT EXISTS ads_min_ctr              numeric,         -- override: CTR below which an ad is flagged
    ADD COLUMN IF NOT EXISTS ads_cpl_multiplier       numeric,         -- override: alert when CPL > target_cpl * this
    ADD COLUMN IF NOT EXISTS ads_overspend_multiplier numeric;         -- override: auto-pause when daily spend > budget * this

-- The monitoring cron sweeps managed campaigns only, so make that the index.
CREATE INDEX IF NOT EXISTS idx_campaigns_managed_ads
    ON campaigns(managed_ad_account_id)
    WHERE managed_ad_account_id IS NOT NULL;

-- ── 3. frequency ────────────────────────────────────────────────────────────
--
-- The fatigue rule is defined in terms of frequency (impressions per person),
-- but no sync has ever requested that field from Meta: syncMetaAccount and
-- syncMetaAds both ask for impressions,reach,clicks,spend,actions only. Without
-- this column there is nowhere to put it, so the rule could never fire.
--
-- Meta returns frequency per row already averaged, so this is stored, not
-- derived. numeric (not integer): typical values are 1.0-5.0 with decimals.
-- DEFAULT 0 keeps every historical row readable; 0 is also safely BELOW any
-- fatigue threshold, so backfilled history can never trigger a spurious pause.
ALTER TABLE ad_metrics    ADD COLUMN IF NOT EXISTS frequency numeric NOT NULL DEFAULT 0;
ALTER TABLE ad_ad_metrics ADD COLUMN IF NOT EXISTS frequency numeric NOT NULL DEFAULT 0;

-- ── 4. ads_alerts ───────────────────────────────────────────────────────────
--
-- Append-only log of every rule evaluation that fired. Two jobs:
--   (a) an audit trail for actions taken WITHOUT a human ("why did my campaign
--       stop spending at 3am") - action_taken records exactly what we did;
--   (b) dedup. The cron re-evaluates every 6h and a fatigued ad stays fatigued,
--       so without a record of the last firing the same alert would be emailed
--       four times a day forever.
--
-- ad_campaign_id / ad_external_id are both nullable because the rules operate at
-- different levels: overspend pauses a whole campaign, fatigue pauses one ad.
CREATE TABLE IF NOT EXISTS ads_alerts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    campaign_id     uuid NOT NULL REFERENCES campaigns(id)     ON DELETE CASCADE,
    ad_campaign_id  uuid REFERENCES ad_campaigns(id) ON DELETE SET NULL,  -- Meta campaign, when scoped to one
    ad_external_id  text,                          -- Meta ad id, when the rule targeted a single ad
    alert_type      varchar(40) NOT NULL,          -- fatigue | low_ctr | high_cpl | overspend
    metric_value    numeric,                       -- the observed value that tripped the rule
    threshold_value numeric,                       -- what it was compared against
    action_taken    varchar(40) NOT NULL DEFAULT 'none',  -- none | flagged | paused_ad | paused_campaign
    detail          text,                          -- human-readable line reused verbatim in the alert email
    notified_at     timestamptz,                   -- NULL = not emailed yet (or delivery failed); see mailer sent==true
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Dedup lookup: "has this campaign already fired this alert type recently?"
CREATE INDEX IF NOT EXISTS idx_ads_alerts_dedup
    ON ads_alerts(campaign_id, alert_type, created_at DESC);
-- Alert-history endpoint + the daily report, both org-scoped and time-ordered.
CREATE INDEX IF NOT EXISTS idx_ads_alerts_org_created
    ON ads_alerts(organization_id, created_at DESC);

-- ── 5. campaign_creatives ───────────────────────────────────────────────────
--
-- Assets the CLIENT supplies (real product photos), which we host and then push
-- to Meta. Distinct from ad_creatives (0070), which is the opposite direction: a
-- cached PREVIEW pulled back out of Meta for reporting. Same word, opposite flow,
-- so they stay separate tables.
--
-- meta_image_hash / meta_video_id are NULL until the asset is uploaded to Meta.
-- Both exist because Meta returns a content hash for images but an id for videos.
-- We never generate creative variations ourselves: Advantage+ does that, so
-- there is nothing here describing crops, overlays or placements.
CREATE TABLE IF NOT EXISTS campaign_creatives (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    campaign_id     uuid NOT NULL REFERENCES campaigns(id)     ON DELETE CASCADE,
    file_url        text NOT NULL,                 -- our MinIO/S3 URL (source of truth we control)
    media_type      varchar(20) NOT NULL,          -- image | video
    file_name       text,
    file_size       bigint,
    meta_image_hash text,                          -- set after upload to /{act}/adimages
    meta_video_id   text,                          -- set after upload to /{act}/advideos
    meta_synced_at  timestamptz,                   -- NULL = never pushed to Meta
    status          varchar(20) NOT NULL DEFAULT 'uploaded',  -- uploaded | active | paused | fatigued
    uploaded_by     uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_creatives_campaign
    ON campaign_creatives(campaign_id, created_at DESC);

-- +goose Down
DROP TABLE IF EXISTS campaign_creatives;
DROP TABLE IF EXISTS ads_alerts;

ALTER TABLE ad_ad_metrics DROP COLUMN IF EXISTS frequency;
ALTER TABLE ad_metrics    DROP COLUMN IF EXISTS frequency;

DROP INDEX IF EXISTS idx_campaigns_managed_ads;
ALTER TABLE campaigns
    DROP COLUMN IF EXISTS managed_ad_account_id,
    DROP COLUMN IF EXISTS target_cpl,
    DROP COLUMN IF EXISTS ads_report_enabled,
    DROP COLUMN IF EXISTS ads_fatigue_freq,
    DROP COLUMN IF EXISTS ads_min_ctr,
    DROP COLUMN IF EXISTS ads_cpl_multiplier,
    DROP COLUMN IF EXISTS ads_overspend_multiplier;
