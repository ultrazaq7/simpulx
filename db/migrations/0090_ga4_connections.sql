-- +goose Up
-- GA4 (Google Analytics 4) connections. Mirrors the ad_accounts pattern: a
-- per-org connection storing the GA4 property id + an OAuth refresh token (minted
-- with the analytics.readonly scope). The OAuth client_id/secret are reused from
-- the Google Ads env vars. A connection is optionally mapped to one of our
-- campaigns so the campaign report can pull that property's landing-page data.
CREATE TABLE IF NOT EXISTS ga4_connections (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    property_id      text NOT NULL,
    refresh_token    text NOT NULL,
    name             text,
    campaign_id      uuid REFERENCES campaigns(id) ON DELETE SET NULL,
    last_synced_at   timestamptz,
    last_error       text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ga4_connections_org ON ga4_connections(organization_id);
CREATE INDEX IF NOT EXISTS idx_ga4_connections_campaign ON ga4_connections(campaign_id);

-- +goose Down
DROP TABLE IF EXISTS ga4_connections;
