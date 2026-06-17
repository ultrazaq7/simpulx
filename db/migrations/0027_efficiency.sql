-- +goose Up
-- ============================================================
-- Simpulx v2 - LLM efficiency + Simpuler naming.
--   1. ai_extracted_at: last time the (expensive) LLM analyze ran for a
--      conversation, used for a burst cooldown so a flurry of short WhatsApp
--      messages collapses into ~one call.
--   2. Routine model Opus -> Sonnet (column default + existing rows).
--   3. Name the engagement assistant "Simpuler".
-- ============================================================

ALTER TABLE conversations ADD COLUMN ai_extracted_at timestamptz;

ALTER TABLE ai_agents ALTER COLUMN model SET DEFAULT 'claude-sonnet-4-6';
UPDATE ai_agents SET model = 'claude-sonnet-4-6' WHERE model = 'claude-opus-4-8';

UPDATE ai_agents SET name = 'Simpuler';

-- +goose Down
ALTER TABLE ai_agents ALTER COLUMN model SET DEFAULT 'claude-opus-4-8';
ALTER TABLE conversations DROP COLUMN IF EXISTS ai_extracted_at;
