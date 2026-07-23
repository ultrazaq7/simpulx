-- +goose Up
-- Partnership ads (Meta branded content): run the ad from the CLIENT's IG
-- handle so they earn awareness from campaigns we manage. The verified API
-- path is instagram_user_id + source_instagram_media_id on adcreatives; the
-- IG-generated ad code is stored now and wired once Meta documents its param.
-- Requires the app permission instagram_branded_content_ads_brand (App Review).
ALTER TABLE campaigns ADD COLUMN partnership_enabled     boolean NOT NULL DEFAULT false;
ALTER TABLE campaigns ADD COLUMN partnership_ig_user_id  text;
ALTER TABLE campaigns ADD COLUMN partnership_ig_media_id text;
ALTER TABLE campaigns ADD COLUMN partnership_ad_code     text;
ALTER TABLE campaigns ADD COLUMN partnership_meta_ad_id  text; -- the created partnership ad (idempotence)

-- +goose Down
ALTER TABLE campaigns DROP COLUMN partnership_enabled;
ALTER TABLE campaigns DROP COLUMN partnership_ig_user_id;
ALTER TABLE campaigns DROP COLUMN partnership_ig_media_id;
ALTER TABLE campaigns DROP COLUMN partnership_ad_code;
ALTER TABLE campaigns DROP COLUMN partnership_meta_ad_id;
