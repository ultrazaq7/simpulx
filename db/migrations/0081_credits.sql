-- +goose Up
-- WS-F / Phase 10: two-tier Simpuler-credit system.
--   org_subscriptions = the org's quota pool (package + quotas jsonb).
--   campaign_credits  = per-campaign allocation + usage; 1 credit is debited per
--                       Simpuler bot reply at bot-outbound persist (messaging).
-- When a campaign runs out, the AI degrades to human (the lead is never dropped).

CREATE TABLE org_subscriptions (
    organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    package_name    varchar(60)  NOT NULL DEFAULT 'starter',
    status          varchar(20)  NOT NULL DEFAULT 'active',   -- active | trial | expired
    renewal_date    date,
    quotas          jsonb        NOT NULL DEFAULT '{"users":10,"simpuler_credits":1000,"custom_fields":20}'::jsonb,
    created_at      timestamptz  NOT NULL DEFAULT now(),
    updated_at      timestamptz  NOT NULL DEFAULT now()
);
INSERT INTO org_subscriptions (organization_id)
  SELECT id FROM organizations
  ON CONFLICT (organization_id) DO NOTHING;

CREATE TABLE campaign_credits (
    campaign_id           uuid PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
    allocated_credits     integer NOT NULL DEFAULT 0,
    used_credits          integer NOT NULL DEFAULT 0,
    low_balance_threshold integer NOT NULL DEFAULT 50,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now()
);
INSERT INTO campaign_credits (campaign_id)
  SELECT id FROM campaigns
  ON CONFLICT (campaign_id) DO NOTHING;

-- +goose Down
DROP TABLE IF EXISTS campaign_credits;
DROP TABLE IF EXISTS org_subscriptions;
