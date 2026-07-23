-- +goose Up
-- The launch CREATE step (0109 built the prerequisites; this is the last input
-- it still lacked). A click-to-WhatsApp ad runs "as" a Facebook Page, so the
-- campaign records which Page — per campaign, not per account, because one ad
-- account routinely advertises for several pages/brands. Launch audit columns
-- record who pressed the button and when, since it creates real (paused)
-- objects in the client's ad account.
ALTER TABLE campaigns
    ADD COLUMN IF NOT EXISTS meta_page_id    text,
    ADD COLUMN IF NOT EXISTS meta_page_name  text,
    ADD COLUMN IF NOT EXISTS ads_launched_at timestamptz,
    ADD COLUMN IF NOT EXISTS ads_launched_by uuid;

-- +goose Down
ALTER TABLE campaigns
    DROP COLUMN IF EXISTS ads_launched_by,
    DROP COLUMN IF EXISTS ads_launched_at,
    DROP COLUMN IF EXISTS meta_page_name,
    DROP COLUMN IF EXISTS meta_page_id;
