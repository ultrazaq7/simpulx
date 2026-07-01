-- +goose Up

-- ============================================================
-- 0066_ad_breakdowns — Meta ad insights broken down by a demographic
-- dimension (age / gender). One aggregated snapshot per (account, dimension,
-- value) over the sync window; refreshed on each account sync.
-- ============================================================
CREATE TABLE IF NOT EXISTS ad_breakdowns (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    ad_account_id    uuid NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
    dimension        varchar(20) NOT NULL,   -- age | gender
    value            varchar(40) NOT NULL,   -- e.g. 25-34 | male | unknown
    impressions      bigint  NOT NULL DEFAULT 0,
    reach            bigint  NOT NULL DEFAULT 0,
    clicks           bigint  NOT NULL DEFAULT 0,
    results          bigint  NOT NULL DEFAULT 0,
    spend            numeric(14,2) NOT NULL DEFAULT 0,
    synced_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (ad_account_id, dimension, value)
);
CREATE INDEX IF NOT EXISTS idx_ad_breakdowns_org ON ad_breakdowns(organization_id, dimension);

-- +goose Down
DROP TABLE IF EXISTS ad_breakdowns;
