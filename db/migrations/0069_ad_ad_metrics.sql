-- +goose Up
-- Ad-level (per creative) daily metrics. Meta campaign insights (ad_metrics) are
-- too coarse for the "Per ad / creative" table, which is keyed by the CTWA ad id
-- (= conversation_attributions.referral_source). This table stores level=ad
-- insights so each creative row can show real Spend / Cost-per-lead, mirroring the
-- campaign ROI table.
CREATE TABLE IF NOT EXISTS ad_ad_metrics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  ad_account_id   uuid NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  ad_external_id  text NOT NULL,                 -- Meta ad_id (= CTWA referral source_id)
  ad_name         text NOT NULL DEFAULT '',
  date            date NOT NULL,
  impressions     bigint NOT NULL DEFAULT 0,
  reach           bigint NOT NULL DEFAULT 0,
  clicks          bigint NOT NULL DEFAULT 0,
  spend           numeric(14,2) NOT NULL DEFAULT 0,
  currency        text,
  UNIQUE (organization_id, ad_external_id, date)
);
CREATE INDEX IF NOT EXISTS idx_ad_ad_metrics_org_date ON ad_ad_metrics(organization_id, date);
CREATE INDEX IF NOT EXISTS idx_ad_ad_metrics_ext ON ad_ad_metrics(organization_id, ad_external_id);
