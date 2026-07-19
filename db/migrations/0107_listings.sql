-- +goose Up
-- Property e-catalog: one public listing site per ORGANISATION.
--
-- Deliberately NOT campaign_catalog. That table is a per-CAMPAIGN pricelist (one
-- unit explodes into many rows: variant x tenor x DP) that only the AI reads. A
-- listing is the opposite shape: one physical unit = one row, owned by the org,
-- shown to the PUBLIC, and it needs things a pricelist never has (photos, a URL
-- slug, publish state, map coordinates). Automotive/finance orgs keep using
-- campaign_catalog; property orgs use this. No duplicated admin work either way.
--
-- campaign_id is optional: it scopes a listing to a project/cluster so AI
-- grounding can prefer the inventory of the campaign the lead came from, while
-- the public site still lists everything the org published.
CREATE TABLE listings (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    campaign_id     uuid REFERENCES campaigns(id) ON DELETE SET NULL,
    slug            varchar(160) NOT NULL,        -- URL segment (unique per org)
    title           varchar(200) NOT NULL,
    property_type   varchar(60),                  -- Rumah | Ruko | Apartemen | Tanah | Kavling | ...
    status          varchar(20)  NOT NULL DEFAULT 'draft',  -- draft | published | sold | archived
    price           numeric,
    location_area   varchar(160),                 -- "Sawangan, Depok"
    city            varchar(120),
    address         text,
    latitude        double precision,             -- map pin (Google Maps)
    longitude       double precision,
    bedrooms        smallint,
    bathrooms       smallint,
    land_area       numeric,                      -- LT (m2)
    building_area   numeric,                      -- LB (m2)
    certificate     varchar(40),                  -- SHM | HGB | PPJB | Girik | ...
    description     text,
    -- Ordered array of {url, name}; the FIRST entry is the cover photo. A jsonb
    -- array (not a child table) keeps ordering trivial and matches how the rest
    -- of the schema stores media/attribute bags.
    photos          jsonb        NOT NULL DEFAULT '[]',
    -- Anything segment/developer specific: carport, furnished, facilities, promo.
    attributes      jsonb        NOT NULL DEFAULT '{}',
    sort_order      integer      NOT NULL DEFAULT 0,
    published_at    timestamptz,
    created_at      timestamptz  NOT NULL DEFAULT now(),
    updated_at      timestamptz  NOT NULL DEFAULT now(),
    UNIQUE (organization_id, slug)
);

-- Public site lists published rows per org; admin panel lists all of them.
CREATE INDEX idx_listings_org_status ON listings(organization_id, status, sort_order);
-- Filters the public site + the AI recommender actually use.
CREATE INDEX idx_listings_org_city   ON listings(organization_id, city);
CREATE INDEX idx_listings_org_price  ON listings(organization_id, price);
CREATE INDEX idx_listings_campaign   ON listings(campaign_id);

-- +goose Down
DROP TABLE IF EXISTS listings;
