-- +goose Up
-- Payment proof on a transaction request. Paid signups and top-ups are settled
-- by manual bank transfer, so the requester uploads the transfer receipt right
-- after submitting; the operator sees it next to the request and approves with
-- evidence on screen instead of cross-checking a bank mutation by memory.
ALTER TABLE platform_transactions
    ADD COLUMN IF NOT EXISTS payment_proof_url text,
    ADD COLUMN IF NOT EXISTS proof_uploaded_at timestamptz;

-- +goose Down
ALTER TABLE platform_transactions
    DROP COLUMN IF EXISTS proof_uploaded_at,
    DROP COLUMN IF EXISTS payment_proof_url;
