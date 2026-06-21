-- +goose Up
-- Persist the in-browser call recording (mixed local + remote audio) so it can be
-- downloaded later from Call Logs, not just at the moment the call ends.
ALTER TABLE calls ADD COLUMN IF NOT EXISTS recording_url text;

-- +goose Down
ALTER TABLE calls DROP COLUMN IF EXISTS recording_url;
