-- +goose Up
-- P4 revenue-impact dashboard. "Revenue Influenced" is computed hybrid (user
-- decision 2026-07-18): the catalog OTR (campaign_catalog.headline_price) matched
-- to the booked lead's model when available, else this per-campaign average deal
-- value as a fallback. NULL => that campaign contributes 0 via OTR only (fallback
-- off) until an average is set.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS avg_deal_value numeric;

-- +goose Down
ALTER TABLE campaigns DROP COLUMN IF EXISTS avg_deal_value;
