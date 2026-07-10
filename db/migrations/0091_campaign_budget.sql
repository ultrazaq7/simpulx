-- +goose Up
-- Optional user-set monthly ad budget per campaign, for the Budget Utilization
-- panel (Media Budget / Cost / Budget Left / %) in the campaign report.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS monthly_budget numeric;

-- +goose Down
ALTER TABLE campaigns DROP COLUMN IF EXISTS monthly_budget;
