-- +goose Up
-- WS-A: segment-generic catalog / KB, scoped per campaign.
--   The live finance lookup uses a GLOBAL finance_packages table (no org/campaign
--   scoping) so every campaign can read every dealer's pricing (cross-dealer leak),
--   and it is automotive-only. campaign_catalog fixes both: one row = one sellable
--   item, scoped to its campaign; spine columns cover every segment while
--   `attributes` jsonb holds segment-specific fields (auto: variant/dp/tenor/emi;
--   property: unit_type/size; finance: plafon/tenor/rate).
-- finance_packages is left in place as a fallback until a campaign has its own rows.

CREATE TABLE campaign_catalog (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    campaign_id     uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    segment         varchar(60),
    category_type   varchar(60),
    item_name       varchar(200) NOT NULL,       -- brand+model / unit / product name
    variant_name    varchar(200),
    location_name   varchar(120),                -- city / area (segment-agnostic)
    headline_price  numeric,                     -- OTR / list price / plafon
    effective_month varchar(7),                  -- 'YYYY-MM' batch key for re-upload
    source_ref      varchar(255),                -- filename / upload id
    attributes      jsonb        NOT NULL DEFAULT '{}',
    created_at      timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX idx_catalog_campaign ON campaign_catalog(campaign_id);
CREATE INDEX idx_catalog_item ON campaign_catalog(campaign_id, item_name);

-- +goose Down
DROP TABLE IF EXISTS campaign_catalog;
