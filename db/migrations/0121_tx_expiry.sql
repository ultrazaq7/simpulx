-- +goose Up
-- Credit / subscription expiry per transaction, so renewals can be chased from
-- the Transactions queue and the AI Usage header can show when credits lapse
-- (credits do NOT roll over). For a signup Bundle this is the subscription
-- renewal date; for an AI Kredit top-up it is the pack's validity window
-- (Lite +1 month, Plus +3 months, Max +6 months), computed at approval.
ALTER TABLE platform_transactions
    ADD COLUMN IF NOT EXISTS expiry_date date;

-- +goose Down
ALTER TABLE platform_transactions DROP COLUMN IF EXISTS expiry_date;
