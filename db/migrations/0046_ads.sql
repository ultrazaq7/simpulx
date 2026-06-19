-- +goose Up
-- Ad performance reporting. Platform-agnostic so Meta, TikTok and Google Ads all
-- share the same shape; the `platform` column distinguishes the fetcher.
--
--   ad_accounts   - one connected ad account (token + external id).
--   ad_campaigns  - ad-side campaigns discovered on sync, optionally mapped to
--                   one of OUR campaigns (campaigns.id) so spend can be joined to
--                   leads/conversions for cost-per-lead and cost-per-sale.
--   ad_metrics    - daily metrics per ad campaign (the "Daily Performance" table).

CREATE TABLE IF NOT EXISTS ad_accounts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL,
  platform            text NOT NULL,                 -- meta | tiktok | google
  external_account_id text NOT NULL,                 -- Meta act id (no act_ prefix), TikTok advertiser id, ...
  name                text NOT NULL DEFAULT '',
  access_token        text,
  status              text NOT NULL DEFAULT 'connected',  -- connected | error
  currency            text,
  last_synced_at      timestamptz,
  last_error          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, platform, external_account_id)
);

CREATE TABLE IF NOT EXISTS ad_campaigns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  ad_account_id   uuid NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  platform        text NOT NULL,
  external_id     text NOT NULL,
  name            text NOT NULL DEFAULT '',
  campaign_id     uuid,                              -- mapped to OUR campaigns(id); null = unmapped
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ad_account_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_campaign ON ad_campaigns(campaign_id);

CREATE TABLE IF NOT EXISTS ad_metrics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  ad_account_id   uuid NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  ad_campaign_id  uuid NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  date            date NOT NULL,
  impressions     bigint NOT NULL DEFAULT 0,
  reach           bigint NOT NULL DEFAULT 0,
  clicks          bigint NOT NULL DEFAULT 0,
  results         bigint NOT NULL DEFAULT 0,
  spend           numeric(14,2) NOT NULL DEFAULT 0,
  currency        text,
  UNIQUE (ad_campaign_id, date)
);
CREATE INDEX IF NOT EXISTS idx_ad_metrics_org_date ON ad_metrics(organization_id, date);
