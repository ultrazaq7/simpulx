-- +goose Up
-- Two corrections to the ads-management schema, both found before anything used
-- the affected columns.

-- ── 1. A dedicated CAPI token ───────────────────────────────────────────────
--
-- capi.go authenticates the Conversions API with ad_accounts.access_token, the
-- SAME token the insights sync uses. In practice the two are issued separately:
-- CAPI is set up in Events Manager and hands out a token scoped to the dataset,
-- while the ads token comes from the ad-account OAuth flow. Forcing both through
-- one column means enabling CAPI would overwrite the ads token and silently kill
-- the metrics sync (which fails as "no access token on file" long after the edit).
--
-- Nullable, and the reader falls back to access_token when it is NULL, so an
-- account whose single token happens to cover both keeps working untouched.
-- Encrypted at rest by the same AES-256-GCM helpers as access_token: the value is
-- a live credential that can write conversions into a customer's dataset.
ALTER TABLE ad_accounts ADD COLUMN IF NOT EXISTS capi_access_token text;

-- ── 2. Geo resolution: cache globally, decide per campaign ──────────────────
--
-- 0109 put `confirmed` on meta_geo_targets, which is keyed (country_code, query)
-- and therefore GLOBAL. That was wrong, and wrong in exactly the way the table
-- exists to prevent: "Depok" matches a city in Jawa Barat and a kecamatan in
-- Sleman, so the answer to "which Depok" belongs to whoever asked. With the flag
-- global, the first org to confirm a city would silently decide it for every
-- other org, and the second org's ads would run in a province it does not serve
-- with no error anywhere.
--
-- The split: SEARCH RESULTS are genuinely global (Meta's key for a place is the
-- same for everyone) and stay cached here to avoid re-querying. The CHOICE moves
-- to campaign_geo_targets, one row per (campaign, city).
ALTER TABLE meta_geo_targets DROP COLUMN IF EXISTS confirmed;

COMMENT ON TABLE meta_geo_targets IS
  'Global cache of Meta adgeolocation search results per (country, query). Candidates only - which candidate a campaign actually targets lives in campaign_geo_targets.';

CREATE TABLE IF NOT EXISTS campaign_geo_targets (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id  uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    -- The city as it appears in campaigns.covered_cities, normalized the same way
    -- meta_geo_targets.query is, so the two join without guesswork.
    query        text NOT NULL,
    meta_key     text NOT NULL,          -- the candidate this campaign targets
    meta_type    varchar(20),            -- city | region | ...
    display_name text,                   -- what Meta calls it, shown on the review screen
    region       text,                   -- province, the field that disambiguates
    -- Who settled it. NULL actor = resolved automatically because the search
    -- returned exactly one candidate, which is the only case safe to auto-confirm.
    confirmed_by uuid REFERENCES users(id) ON DELETE SET NULL,
    confirmed_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (campaign_id, query)
);

CREATE INDEX IF NOT EXISTS idx_campaign_geo_targets_campaign
    ON campaign_geo_targets(campaign_id);

-- +goose Down
DROP TABLE IF EXISTS campaign_geo_targets;
ALTER TABLE meta_geo_targets ADD COLUMN IF NOT EXISTS confirmed boolean NOT NULL DEFAULT false;
ALTER TABLE ad_accounts DROP COLUMN IF EXISTS capi_access_token;
