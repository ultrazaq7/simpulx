-- +goose Up
-- Ad creative preview fetched from Meta (keyed by ad_id == CTWA referral
-- source_id). CTWA referral webhooks only carry the image for image/video ads
-- and only going forward, so we also pull the creative thumbnail from the ads
-- endpoint to reliably show a preview in the "Per ad / creative" table.
CREATE TABLE IF NOT EXISTS ad_creatives (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  ad_account_id   uuid NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  ad_external_id  text NOT NULL,               -- Meta ad_id
  image_url       text,
  title           text,
  body            text,
  synced_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, ad_external_id)
);
CREATE INDEX IF NOT EXISTS idx_ad_creatives_ext ON ad_creatives(organization_id, ad_external_id);
