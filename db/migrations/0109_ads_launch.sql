-- +goose Up
-- Auto-create ("Launch Ads"): Simpulx builds the Meta campaign / ad set / ad from
-- data the client already entered in Simpulx, so nobody has to open Ads Manager.
-- Builds on 0108 (managed_ad_account_id, thresholds, ads_alerts, campaign_creatives).
--
-- GENERIC BY CONSTRUCTION. Nothing here encodes an industry. Copy and audience are
-- DERIVED per campaign from data the campaign already carries (segment, brand,
-- campaign_catalog, covered_cities) and cached per campaign in the columns below.
-- There is deliberately no segment->interest lookup table and no segment column
-- anywhere in this migration: the moment such a map exists, every new vertical
-- needs a code change. A clinic, a course and a lender all travel the same path
-- and differ only by their own rows.

-- ── Meta object ids + launch state ──────────────────────────────────────────
--
-- The meta_* ids are written BY the backend after a successful create, never
-- typed by a user: they are how we later pause/resume/report on what we made.
-- NULL simply means "not created yet", which is also the pre-launch state.
--
-- ads_status is nullable with NO default on purpose. A default of 'draft' would
-- assert that every existing campaign is a draft ads campaign, when in truth the
-- feature has never touched them. NULL = never launched, and it stays visibly
-- distinct from a real draft someone started.
ALTER TABLE campaigns
    ADD COLUMN IF NOT EXISTS meta_campaign_id text,
    ADD COLUMN IF NOT EXISTS meta_adset_id    text,
    ADD COLUMN IF NOT EXISTS ads_status       varchar(20),  -- draft|pending_review|active|paused|error
    ADD COLUMN IF NOT EXISTS ads_last_error   text,         -- Meta's rejection reason, shown verbatim to the admin
    ADD COLUMN IF NOT EXISTS capi_enabled     boolean NOT NULL DEFAULT true;

-- Audience config. These defaults ARE universal (a starting age band and "all
-- genders"), not industry knowledge, and every one is overridable per campaign.
-- target_interests stays empty by default because a non-empty default could only
-- ever come from guessing an industry.
ALTER TABLE campaigns
    ADD COLUMN IF NOT EXISTS target_age_min             smallint NOT NULL DEFAULT 25,
    ADD COLUMN IF NOT EXISTS target_age_max             smallint NOT NULL DEFAULT 55,
    ADD COLUMN IF NOT EXISTS target_gender              varchar(10) NOT NULL DEFAULT 'all',
    ADD COLUMN IF NOT EXISTS target_interests           jsonb NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS advantage_audience_enabled boolean NOT NULL DEFAULT true;

-- Guard the two fields a typo can silently ruin: an inverted age band or an
-- unexpected gender string is accepted by Postgres but REJECTED by Meta, and the
-- failure would surface much later as a failed launch with an opaque message.
DO $$ BEGIN
    ALTER TABLE campaigns ADD CONSTRAINT chk_campaigns_target_age
        CHECK (target_age_min >= 13 AND target_age_max <= 65 AND target_age_min <= target_age_max);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE campaigns ADD CONSTRAINT chk_campaigns_target_gender
        CHECK (target_gender IN ('all','male','female'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Creative -> Meta ad link ────────────────────────────────────────────────
--
-- Closes the loop for per-creative fatigue WITHOUT a second metrics table. Meta
-- ad-level insights already land in ad_ad_metrics keyed by ad_external_id, so
-- once we know which ad we built from which asset, per-creative spend/CTR is a
-- join away and can never drift out of sync with a duplicated copy.
ALTER TABLE campaign_creatives ADD COLUMN IF NOT EXISTS meta_ad_id text;
CREATE INDEX IF NOT EXISTS idx_campaign_creatives_meta_ad
    ON campaign_creatives(meta_ad_id) WHERE meta_ad_id IS NOT NULL;

-- ── Geo mapping cache ───────────────────────────────────────────────────────
--
-- covered_cities holds human city names ("Depok"); Meta targets opaque keys. The
-- lookup costs an API call per city, so it is cached here and shared org-wide.
--
-- The ambiguity guard is the point of this table. A search for one city can
-- return several plausible places, and picking the first silently aims the budget
-- at the wrong one -- money burns with no error anywhere. So candidates keeps the
-- full response and confirmed marks whether a human (or an unambiguous single
-- match) settled it. A launch must refuse to proceed on unconfirmed rows rather
-- than guess.
CREATE TABLE IF NOT EXISTS meta_geo_targets (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    country_code varchar(2) NOT NULL DEFAULT 'ID',
    query        text NOT NULL,               -- normalized lower(trim(city)) as searched
    meta_key     text,                        -- Meta's targeting key; NULL until resolved
    meta_type    varchar(20),                 -- city | region | country | ...
    display_name text,                        -- what Meta calls it, for the review screen
    region       text,
    candidates   jsonb NOT NULL DEFAULT '[]'::jsonb,   -- every match Meta returned
    confirmed    boolean NOT NULL DEFAULT false,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (country_code, query)
);

-- ── Generated ad copy ───────────────────────────────────────────────────────
--
-- One row per generation, not one per campaign: "regenerate copy because CTR
-- dropped" needs the previous set to still exist to compare against, and an
-- approved set must never be silently overwritten by a fresh draft.
--
-- The variants are stored as arrays and ALL of them are pushed to Meta. Picking a
-- winner ourselves would duplicate what Advantage+ already does with real traffic.
-- Nothing reaches Meta until status='approved' -- generation is never auto-push.
CREATE TABLE IF NOT EXISTS campaign_ad_copy (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    campaign_id    uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    primary_texts  jsonb NOT NULL DEFAULT '[]'::jsonb,   -- ~5 variants
    headlines      jsonb NOT NULL DEFAULT '[]'::jsonb,   -- ~5 variants, <=40 chars
    descriptions   jsonb NOT NULL DEFAULT '[]'::jsonb,   -- ~3 variants, <=30 chars
    status         varchar(20) NOT NULL DEFAULT 'draft', -- draft | approved | superseded
    model          varchar(60),                          -- which model produced it
    generated_at   timestamptz NOT NULL DEFAULT now(),
    approved_at    timestamptz,
    approved_by    uuid REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_campaign_ad_copy_campaign
    ON campaign_ad_copy(campaign_id, generated_at DESC);
-- At most one approved copy set per campaign, enforced by the DB rather than by
-- remembering to demote the old one in application code.
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_ad_copy_one_approved
    ON campaign_ad_copy(campaign_id) WHERE status = 'approved';

-- +goose Down
DROP TABLE IF EXISTS campaign_ad_copy;
DROP TABLE IF EXISTS meta_geo_targets;

DROP INDEX IF EXISTS idx_campaign_creatives_meta_ad;
ALTER TABLE campaign_creatives DROP COLUMN IF EXISTS meta_ad_id;

ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS chk_campaigns_target_gender;
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS chk_campaigns_target_age;
ALTER TABLE campaigns
    DROP COLUMN IF EXISTS advantage_audience_enabled,
    DROP COLUMN IF EXISTS target_interests,
    DROP COLUMN IF EXISTS target_gender,
    DROP COLUMN IF EXISTS target_age_max,
    DROP COLUMN IF EXISTS target_age_min,
    DROP COLUMN IF EXISTS capi_enabled,
    DROP COLUMN IF EXISTS ads_last_error,
    DROP COLUMN IF EXISTS ads_status,
    DROP COLUMN IF EXISTS meta_adset_id,
    DROP COLUMN IF EXISTS meta_campaign_id;
