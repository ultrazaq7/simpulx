-- +goose Up
-- Drip (sequence) ownership for RBAC scoping. owner_user_id is who created the
-- drip; enrollment + visibility follow the creator's role:
--   agent   -> only their own assigned leads
--   manager -> only leads in campaigns they oversee
--   admin/owner (or NULL owner) -> org-wide
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sequences_owner ON sequences(owner_user_id);
