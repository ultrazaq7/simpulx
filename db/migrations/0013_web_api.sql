-- +goose Up

-- ============================================================
-- 0013_web_api — Web API lead sources (ad attribution).
-- External systems / ad platforms POST leads with an API key;
-- each lead is attributed to its source for analytics + campaign routing.
-- ============================================================
CREATE TABLE web_api_sources (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name                varchar(120) NOT NULL,
    slug                varchar(80),
    api_key             varchar(80)  NOT NULL UNIQUE,
    auto_assign_dept_id uuid REFERENCES departments(id) ON DELETE SET NULL,
    auto_template_name  varchar(160),
    webhook_url         text,
    is_active           boolean      NOT NULL DEFAULT true,
    lead_count          integer      NOT NULL DEFAULT 0,
    created_at          timestamptz  NOT NULL DEFAULT now(),
    updated_at          timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX idx_web_api_sources_org ON web_api_sources(organization_id);

-- Attribute each contact to the Web API source that produced the lead.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS web_api_source_id uuid REFERENCES web_api_sources(id) ON DELETE SET NULL;

-- Demo source.
INSERT INTO web_api_sources (organization_id, name, slug, api_key) VALUES
 ('00000000-0000-0000-0000-0000000000a1', 'Meta Ads', 'meta-ads', 'pk_demo_meta_ads_0001');
