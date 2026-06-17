-- +goose Up
-- Soft delete for user accounts. Removing a user must preserve historical
-- attribution (audit logs, who handled past conversations, created_by, etc.),
-- so we tombstone the row instead of physically deleting it: set deleted_at,
-- flip status to inactive (keeps them out of login + lead routing), and free
-- the email for reuse by suffixing it. Deleted rows are hidden everywhere.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_users_active ON users(organization_id) WHERE deleted_at IS NULL;

-- +goose Down
ALTER TABLE users DROP COLUMN IF EXISTS deleted_at;
