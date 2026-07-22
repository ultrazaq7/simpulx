-- +goose Up
-- What the client has actually agreed to let Simpulx do with their ad account.
--
-- Today the answer is "whatever the token permits". A client who connects an
-- account only so Simpulx can REPORT on spend has no way to say so, and nothing
-- in the product distinguishes them from a client who bought the managed
-- service. That matters because the ads work now includes actions that spend or
-- stop spending someone else's money: auto-pause, and shortly create/launch.
--
-- 'read'   - reporting only. Never write to Meta for this account.
-- 'manage' - Simpulx runs the ads: create, pause, resume, upload creative.
--
-- Defaults to 'read', and the default is the point: every EXISTING account was
-- connected before this distinction existed, so assuming consent to manage would
-- grant a permission nobody gave. Upgrading is a deliberate click.
--
-- This is intent, not enforcement of last resort: a read-only Meta token cannot
-- write regardless. The two layers answer different questions -- the token says
-- what is technically possible, this says what was agreed -- and the narrower of
-- the two should always win.
ALTER TABLE ad_accounts
    ADD COLUMN IF NOT EXISTS access_mode varchar(10) NOT NULL DEFAULT 'read';

-- +goose StatementBegin
DO $$ BEGIN
    ALTER TABLE ad_accounts ADD CONSTRAINT chk_ad_accounts_access_mode
        CHECK (access_mode IN ('read','manage'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- +goose StatementEnd

-- +goose Down
ALTER TABLE ad_accounts DROP CONSTRAINT IF EXISTS chk_ad_accounts_access_mode;
ALTER TABLE ad_accounts DROP COLUMN IF EXISTS access_mode;
