-- +goose Up
-- Many-to-many ad-campaign -> OUR-campaign mapping. One ad campaign can now feed
-- several campaigns; spend shows under each mapped campaign (Option A attribution).
-- Supersedes the single ad_campaigns.campaign_id, which is kept in sync with the
-- first mapping for back-compat but is no longer the source of truth.
CREATE TABLE IF NOT EXISTS ad_campaign_campaigns (
  ad_campaign_id  uuid NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  campaign_id     uuid NOT NULL REFERENCES campaigns(id)    ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ad_campaign_id, campaign_id)
);
CREATE INDEX IF NOT EXISTS idx_acc_campaign ON ad_campaign_campaigns(campaign_id);
CREATE INDEX IF NOT EXISTS idx_acc_org ON ad_campaign_campaigns(organization_id);

-- Backfill from the existing single mapping so nothing is lost.
INSERT INTO ad_campaign_campaigns (ad_campaign_id, campaign_id, organization_id)
SELECT id, campaign_id, organization_id FROM ad_campaigns WHERE campaign_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- +goose Down
DROP TABLE IF EXISTS ad_campaign_campaigns;
