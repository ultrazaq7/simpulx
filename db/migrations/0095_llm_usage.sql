-- +goose Up

-- ============================================================
-- 0095: llm_usage — per-call AI token/cost ledger
-- ============================================================
-- Why this table exists: cost-per-conversation was uncomputable, because deleting
-- a contact cascades away its conversations + messages — the DENOMINATOR of every
-- cost metric. Spend stayed on the Anthropic invoice; the volume that produced it
-- vanished from the DB.
--
-- Two rules follow from that, and both are load-bearing:
--   1. NO cascade, NO FK. conversation_id is a plain uuid on purpose. A row here
--      MUST survive deletion of the conversation/contact it refers to — that is
--      the entire point of the table. Adding `REFERENCES conversations(id)` here,
--      in any form, re-creates the bug this table was built to fix.
--   2. NO PII. Only ids, token counts, and a feature label. Nothing here is
--      personal data, so contact erasure (UU PDP) never needs to touch it and
--      cleanup never destroys cost history.
--
-- organization_id is likewise unconstrained: the ledger outlives the org row.

CREATE TABLE llm_usage (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  conversation_id uuid,              -- nullable: catalog extraction has no conversation
  feature         text NOT NULL,     -- 'extract' | 'nurture' | 'summary' | 'reply' | 'catalog'
  model           text NOT NULL,
  tokens_in       int  NOT NULL DEFAULT 0,
  tokens_out      int  NOT NULL DEFAULT 0,
  cache_read      int  NOT NULL DEFAULT 0,
  cache_write     int  NOT NULL DEFAULT 0,
  -- Best-effort, NULL when the model is not in the app's price table. Token counts
  -- above are the durable facts; cost is always recomputable from them, so a stale
  -- price table is fixable with an UPDATE and never loses data.
  cost_usd        numeric(12,6),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_llm_usage_org_time ON llm_usage (organization_id, created_at DESC);

-- +goose Down
DROP TABLE IF EXISTS llm_usage;
