-- +goose Up

-- ============================================================
-- 0079_web_api_source_platform — Web API lead sources get an explicit
-- platform tag (meta | tiktok | google | other), matching ad_accounts.platform's
-- vocabulary. Contacts/exports/logs previously all showed a generic "Ad" /
-- "web" label for non-CTWA leads; this lets every one of them show the real
-- platform (Meta Ads / TikTok Ads / Google Ads / Website) consistently.
-- ============================================================
ALTER TABLE web_api_sources ADD COLUMN IF NOT EXISTS platform varchar(20);

-- Backfill existing sources by best-effort name match; anything unmatched
-- falls back to 'other' rather than being left NULL.
UPDATE web_api_sources SET platform = CASE
    WHEN platform IS NOT NULL THEN platform
    WHEN name ILIKE '%meta%' OR name ILIKE '%facebook%' OR name ILIKE '%instagram%' THEN 'meta'
    WHEN name ILIKE '%tiktok%' THEN 'tiktok'
    WHEN name ILIKE '%google%' THEN 'google'
    ELSE 'other'
END
WHERE platform IS NULL;

ALTER TABLE web_api_sources ALTER COLUMN platform SET DEFAULT 'other';
ALTER TABLE web_api_sources ALTER COLUMN platform SET NOT NULL;
ALTER TABLE web_api_sources ADD CONSTRAINT web_api_sources_platform_check
    CHECK (platform IN ('meta','tiktok','google','other'));

-- +goose Down
ALTER TABLE web_api_sources DROP CONSTRAINT IF EXISTS web_api_sources_platform_check;
ALTER TABLE web_api_sources DROP COLUMN IF EXISTS platform;
