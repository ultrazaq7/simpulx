-- ============================================================
-- 0014_campaigns — Campaign as a first-class entity (per dealer on
-- the shared OTO WhatsApp number). A campaign owns assigned agents +
-- round-robin routing. Inbound leads are attributed to a campaign by
-- CTWA ad referral, Web API source (publisher), or first-message keyword.
-- NO credits / billing (LLM is self-trained/free).
-- ============================================================
CREATE TABLE campaigns (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name              varchar(160) NOT NULL,
    dealer_name       varchar(160),                          -- the dealer this campaign belongs to
    status            varchar(20)  NOT NULL DEFAULT 'active', -- active|paused
    routing_strategy  varchar(20)  NOT NULL DEFAULT 'round_robin', -- round_robin|manual
    ad_source_ids     text[]       NOT NULL DEFAULT '{}',     -- CTWA referral.source_id values
    keywords          text[]       NOT NULL DEFAULT '{}',     -- first-message keywords
    rr_cursor         integer      NOT NULL DEFAULT 0,        -- round-robin pointer
    lead_count        integer      NOT NULL DEFAULT 0,
    created_at        timestamptz  NOT NULL DEFAULT now(),
    updated_at        timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX idx_campaigns_org ON campaigns(organization_id);

CREATE TABLE campaign_agents (
    campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (campaign_id, user_id)
);
CREATE INDEX idx_campaign_agents_user ON campaign_agents(user_id);

-- Attribution links.
ALTER TABLE conversations    ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL;
ALTER TABLE web_api_sources  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_conv_campaign ON conversations(campaign_id);

-- Demo campaign so routing is testable.
INSERT INTO campaigns (id, organization_id, name, dealer_name, ad_source_ids, keywords) VALUES
 ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1',
  'Honda Brio - Jakarta', 'Honda HR Muhammad',
  '{ad_honda_brio_2026}', '{brio,honda}');

INSERT INTO campaign_agents (campaign_id, user_id) VALUES
 ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1'),
 ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e2');

-- Route the demo Web API source to this campaign.
UPDATE web_api_sources SET campaign_id = '00000000-0000-0000-0000-0000000000f1'
 WHERE organization_id = '00000000-0000-0000-0000-0000000000a1' AND slug = 'meta-ads';
