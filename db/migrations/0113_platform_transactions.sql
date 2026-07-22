-- +goose Up
-- Self-serve onboarding + credit top-ups, approved BY A HUMAN.
--
-- One table for both request kinds, because the operator experience is one
-- queue: "who wants in, who wants credits, what did we decide". A signup that is
-- approved becomes an organisation; a top-up that is approved becomes credits on
-- an existing one. Nothing happens on submission except this row and an email to
-- the operator -- the public endpoint cannot create an org, add credits, or touch
-- any tenant data, which is what makes it safe to expose without auth.
--
-- amount is computed SERVER-SIDE from the package at submission time and frozen
-- here, so the number the operator approves is the number the requester saw,
-- even if pricing changes between the two moments.
CREATE TABLE IF NOT EXISTS platform_transactions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type            varchar(10) NOT NULL,                    -- signup | topup
    status          varchar(10) NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
    -- Requester, as typed. Free text on purpose: this is an inbound lead form,
    -- not tenant data, and the human approving it is the validation step.
    org_name        text,
    industry        text,
    contact_name    text NOT NULL,
    contact_email   text NOT NULL,
    contact_phone   text,
    package_name    varchar(20) NOT NULL,   -- signup: trial|starter|growth|business  topup: booster|pro|enterprise
    seats           int,                    -- signup only
    credits         int NOT NULL DEFAULT 0, -- what approval will grant
    amount          numeric(14,2) NOT NULL DEFAULT 0,
    -- Set on approval: the org a signup created, or the org a top-up landed on.
    organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
    note            text,                   -- requester's message
    decided_by      uuid REFERENCES users(id) ON DELETE SET NULL,
    decided_at      timestamptz,
    decision_note   text,
    -- Sequential invoice number, assigned ONLY on approval (an unpaid request has
    -- no invoice). Gaps from rejections never occur because rejected rows are
    -- simply never numbered.
    invoice_no      bigint,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_tx_status ON platform_transactions(status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_tx_invoice ON platform_transactions(invoice_no) WHERE invoice_no IS NOT NULL;

-- Invoice numbers must be sequential and gap-free for bookkeeping (P6 notes), so
-- they come from a dedicated sequence claimed inside the approval transaction.
CREATE SEQUENCE IF NOT EXISTS platform_invoice_seq START 1001;

-- +goose Down
DROP SEQUENCE IF EXISTS platform_invoice_seq;
DROP TABLE IF EXISTS platform_transactions;
