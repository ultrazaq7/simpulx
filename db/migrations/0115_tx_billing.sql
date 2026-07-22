-- +goose Up
-- Billing cycle on a signup request. Annual is prepaid 10 months for 12 (two
-- free); the multiplier is applied server-side at submission and the cycle is
-- recorded here so the operator and the invoice can say what was actually
-- agreed, rather than inferring it back out of the amount.
ALTER TABLE platform_transactions
    ADD COLUMN IF NOT EXISTS billing varchar(10) NOT NULL DEFAULT 'monthly';

-- +goose Down
ALTER TABLE platform_transactions DROP COLUMN IF EXISTS billing;
