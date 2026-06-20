-- +goose Up
-- Carry the section's active filters into the export job so the generated CSV
-- matches exactly what was on screen (and the Downloads tab can show them).
ALTER TABLE export_jobs ADD COLUMN IF NOT EXISTS campaign_id uuid;
ALTER TABLE export_jobs ADD COLUMN IF NOT EXISTS channel_id  uuid;
ALTER TABLE export_jobs ADD COLUMN IF NOT EXISTS label       text;
