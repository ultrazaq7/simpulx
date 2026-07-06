-- +goose Up
-- ad_accounts had created_at but no updated_at; the accounts list now selects
-- updated_at, so without this column the query errors and the Advertising tab
-- shows no data even when accounts are connected.
ALTER TABLE ad_accounts ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- +goose Down
ALTER TABLE ad_accounts DROP COLUMN IF EXISTS updated_at;
