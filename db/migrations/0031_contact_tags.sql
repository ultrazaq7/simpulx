-- +goose Up
-- Free-text tags on contacts (CRM labels) for segmentation + filtering.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_contacts_tags ON contacts USING gin (tags);
