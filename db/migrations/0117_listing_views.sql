-- +goose Up
-- Total views per listing. Incremented by the PUBLIC detail endpoint (one hit =
-- one view; list/grid fetches do not count). A plain counter on the row, not an
-- events table: the ask is "how popular is this unit", not per-day analytics —
-- and a counter can be promoted to events later without losing the total.
ALTER TABLE listings
    ADD COLUMN IF NOT EXISTS view_count bigint NOT NULL DEFAULT 0;

-- +goose Down
ALTER TABLE listings
    DROP COLUMN IF EXISTS view_count;
