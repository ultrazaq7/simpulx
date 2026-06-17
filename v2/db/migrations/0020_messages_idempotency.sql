-- +goose Up
-- Add missing UNIQUE constraint for idempotency on messages
ALTER TABLE messages
    ADD CONSTRAINT idx_messages_org_external_unique UNIQUE (organization_id, external_id);

-- +goose Down
ALTER TABLE messages
    DROP CONSTRAINT IF EXISTS idx_messages_org_external_unique;
