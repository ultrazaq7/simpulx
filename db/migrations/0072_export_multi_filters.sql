-- +goose Up
-- The logs filters (campaign/channel) are multi-select now, so an export can
-- carry several ids. Store them as comma-separated text instead of a single
-- uuid; the export worker splits + ANY()s them.
ALTER TABLE export_jobs ALTER COLUMN campaign_id TYPE text USING campaign_id::text;
ALTER TABLE export_jobs ALTER COLUMN channel_id  TYPE text USING channel_id::text;

-- +goose Down
-- Best-effort restore: keep the first id if a comma-list was stored.
ALTER TABLE export_jobs ALTER COLUMN campaign_id TYPE uuid
  USING NULLIF(split_part(campaign_id, ',', 1), '')::uuid;
ALTER TABLE export_jobs ALTER COLUMN channel_id TYPE uuid
  USING NULLIF(split_part(channel_id, ',', 1), '')::uuid;
