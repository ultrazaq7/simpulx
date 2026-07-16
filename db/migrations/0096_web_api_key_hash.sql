-- +goose Up

-- ============================================================
-- 0096: web_api_sources — stop storing inbound API keys in plaintext
-- ============================================================
-- web_api_sources.api_key was a plaintext varchar, matched by equality on every
-- inbound lead POST (`WHERE api_key = $1`). A DB read — or a copy of the nightly
-- S3 dump — therefore handed out working keys, letting anyone inject leads as the
-- org (spam/poison the CRM, trigger billable WhatsApp sends).
--
-- Keys are high-entropy random (pk_ + uuid), so a fast SHA-256 is the right
-- primitive (no bcrypt work factor needed; auth runs per request). We keep only
-- the hash + a masked hint; the full key is shown to the user exactly once, at
-- create/regenerate time, and is unrecoverable afterwards.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE web_api_sources ADD COLUMN IF NOT EXISTS api_key_hash text;
ALTER TABLE web_api_sources ADD COLUMN IF NOT EXISTS key_hint     text;

-- Backfill while api_key still exists: hash existing plaintext keys so they keep
-- authenticating, and derive a masked hint for the dashboard. Hex-lowercase to
-- match Go's hex.EncodeToString(sha256.Sum256(...)).
UPDATE web_api_sources
   SET api_key_hash = encode(digest(api_key, 'sha256'), 'hex'),
       key_hint     = left(api_key, 8) || '…' || right(api_key, 4)
 WHERE api_key IS NOT NULL AND api_key_hash IS NULL;

-- Drop the plaintext column (also drops its UNIQUE constraint) and move
-- uniqueness onto the hash.
ALTER TABLE web_api_sources DROP COLUMN IF EXISTS api_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_web_api_sources_key_hash ON web_api_sources(api_key_hash);

-- +goose Down
-- Irreversible by design: plaintext keys cannot be recovered from their hash.
-- Rolling back restores the column shape only; existing sources must regenerate
-- their key afterwards.
ALTER TABLE web_api_sources ADD COLUMN IF NOT EXISTS api_key varchar(80);
DROP INDEX IF EXISTS idx_web_api_sources_key_hash;
ALTER TABLE web_api_sources DROP COLUMN IF EXISTS api_key_hash;
ALTER TABLE web_api_sources DROP COLUMN IF EXISTS key_hint;
