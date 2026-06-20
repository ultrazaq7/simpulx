-- +goose Up
-- ============================================================
-- 0048_campaign_dealers — a campaign (e.g. dealer group "UMC") can contain
-- many DEALERS. Each dealer has its own coverage, ad sources and agents, and is
-- the routing unit: a lead is matched to a dealer by ad source, then round-robin
-- assigned among that dealer's agents.
--
-- Dealers are OPTIONAL and backward compatible: a campaign with zero dealers
-- keeps routing at the campaign level (campaign_agents + campaigns.ad_source_ids
-- + web_api_sources.campaign_id), exactly as before.
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_dealers (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    campaign_id       uuid NOT NULL REFERENCES campaigns(id)      ON DELETE CASCADE,
    name              varchar(160) NOT NULL,
    coverage          text        NOT NULL DEFAULT '',   -- informational (areas), not used for routing yet
    ad_source_ids     text[]      NOT NULL DEFAULT '{}',  -- CTWA referral.source_id values for this dealer
    rr_cursor         integer     NOT NULL DEFAULT 0,     -- per-dealer round-robin pointer
    lead_count        integer     NOT NULL DEFAULT 0,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_campaign_dealers_campaign ON campaign_dealers(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_dealers_org ON campaign_dealers(organization_id);

CREATE TABLE IF NOT EXISTS dealer_agents (
    dealer_id uuid NOT NULL REFERENCES campaign_dealers(id) ON DELETE CASCADE,
    user_id   uuid NOT NULL REFERENCES users(id)            ON DELETE CASCADE,
    PRIMARY KEY (dealer_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_dealer_agents_user ON dealer_agents(user_id);

-- Attribution + routing links.
ALTER TABLE conversations   ADD COLUMN IF NOT EXISTS dealer_id uuid REFERENCES campaign_dealers(id) ON DELETE SET NULL;
ALTER TABLE web_api_sources ADD COLUMN IF NOT EXISTS dealer_id uuid REFERENCES campaign_dealers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_conv_dealer ON conversations(dealer_id);
