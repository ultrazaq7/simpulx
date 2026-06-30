-- +goose Up

-- ============================================================
-- 0065_wa_flow_sheets — link a WhatsApp Form to a Google Sheet so each
-- submission is appended as a row (via the service-account connector).
-- ============================================================
ALTER TABLE wa_flows ADD COLUMN IF NOT EXISTS sheet_id      varchar(160);                 -- spreadsheet id (parsed from URL)
ALTER TABLE wa_flows ADD COLUMN IF NOT EXISTS sheet_tab     varchar(120) NOT NULL DEFAULT 'Sheet1';
ALTER TABLE wa_flows ADD COLUMN IF NOT EXISTS sheet_enabled boolean      NOT NULL DEFAULT false;

-- +goose Down
ALTER TABLE wa_flows DROP COLUMN IF EXISTS sheet_enabled;
ALTER TABLE wa_flows DROP COLUMN IF EXISTS sheet_tab;
ALTER TABLE wa_flows DROP COLUMN IF EXISTS sheet_id;
