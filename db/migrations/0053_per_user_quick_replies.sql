-- +goose Up
-- Quick replies become per-user shortcuts: each agent manages their own set, and
-- the same /code can exist for different agents. Drop the org-wide uniqueness and
-- key it per (org, creator, shortcut).
ALTER TABLE quick_replies DROP CONSTRAINT IF EXISTS quick_replies_organization_id_shortcut_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_quick_replies_user_shortcut
    ON quick_replies(organization_id, created_by, shortcut);
