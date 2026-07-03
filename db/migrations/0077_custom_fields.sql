-- +goose Up
-- Org-defined typed custom fields for contacts. Values live in the existing
-- contacts.attributes JSONB (keyed by `key`); this table is the schema/labels
-- so the UI can render typed inputs and attribution stays consistent.
CREATE TABLE IF NOT EXISTS custom_fields (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    key             TEXT NOT NULL,                          -- slug used in contacts.attributes
    label           TEXT NOT NULL,
    type            TEXT NOT NULL DEFAULT 'text',           -- text | number | date | select
    options         JSONB NOT NULL DEFAULT '[]'::jsonb,     -- choices for type=select
    sort_order      INT  NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, key)
);
CREATE INDEX IF NOT EXISTS idx_custom_fields_org ON custom_fields(organization_id, sort_order);

-- +goose Down
DROP TABLE IF EXISTS custom_fields;
