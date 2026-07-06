-- +goose Up
-- Per-campaign toggle for the AI Smart Summary. When off, the inbox composer
-- hides the Smart Summary button for that campaign's conversations. Default on.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ai_smart_summary boolean NOT NULL DEFAULT true;

-- +goose Down
ALTER TABLE campaigns DROP COLUMN IF EXISTS ai_smart_summary;
