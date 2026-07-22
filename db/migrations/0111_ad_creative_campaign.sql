-- +goose Up
-- Remember which Meta CAMPAIGN each synced ad belongs to.
--
-- CTWA leads are routed by matching the referral's source_id (a Meta AD id)
-- against campaigns.ad_source_ids, an array a human types in by hand after
-- copying ids out of Ads Manager. Two things go wrong with that, both silently:
--
--   1. A mistyped id matches no ad, so leads from it never reach the campaign
--      and nothing reports a problem. One campaign here carried exactly such an
--      orphan id (1233822846479521, matching nothing).
--   2. Every NEW ad is a fresh gap. Until someone remembers to paste its id, its
--      leads arrive with no campaign: they are not lost, but they lose the
--      catalogue, the service area, the AI style and the round-robin, and land
--      unassigned in the admin queue.
--
-- Storing the ad's parent campaign lets routing fall back to the campaign
-- MAPPING instead: an ad belongs to a Meta campaign, that Meta campaign is
-- already mapped to one of ours, so a newly created ad routes correctly the
-- moment it is synced, with nobody typing anything. ad_source_ids stays as an
-- explicit override for the cases the mapping cannot express.
ALTER TABLE ad_creatives ADD COLUMN IF NOT EXISTS campaign_external_id text;

-- Routing looks up "which Meta campaign is this ad in", per org, on every CTWA
-- referral that misses the explicit array.
CREATE INDEX IF NOT EXISTS idx_ad_creatives_campaign_ext
    ON ad_creatives(organization_id, ad_external_id)
    WHERE campaign_external_id IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_ad_creatives_campaign_ext;
ALTER TABLE ad_creatives DROP COLUMN IF EXISTS campaign_external_id;
