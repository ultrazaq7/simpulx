-- +goose Up
-- ============================================================
-- Simpulx v2 - AI Summary/Action + Lead Health Score.
--
-- Phase 0 (LLM, no training): per-conversation summary + recommended
-- action + priority, written by the ai-agent on each inbound message.
-- These are ADVISORY only (Summarize/Recommend/Prioritize) - the AI
-- never auto-assigns or auto-closes.
--
-- Phase 1 (XGBoost): lead_score is a 0-100 "Lead Health Score" produced
-- by a behavioral model (services/ai-agent/lead_score.py). It is a
-- prioritization signal, NOT a sales-outcome prediction. Bootstrapped on
-- LLM-labeled historical data; retrained on real won/lost dispositions later.
-- ============================================================

-- User-facing fields use neutral names (no "AI" wording per the Customer
-- Engagement Platform branding); the inbox reads these directly.
ALTER TABLE conversations
    ADD COLUMN lead_summary          text,             -- short digest of the chat (Highlights)
    ADD COLUMN lead_priority         varchar(10),      -- high | medium | low
    ADD COLUMN suggested_action      varchar(20),      -- call | message | wait | handoff
    ADD COLUMN suggested_action_reason text,           -- why this next step (1 sentence)
    ADD COLUMN suggested_action_confidence numeric(5,4), -- 0..1
    ADD COLUMN lead_score            numeric(5,2),     -- 0..100 buy-potential score (CatBoost)
    ADD COLUMN lead_score_model_version varchar(40),   -- which model produced lead_score
    ADD COLUMN lead_score_at         timestamptz;      -- when lead_score was last computed

-- Inbox "call first" sorting: highest-scoring open leads per org.
CREATE INDEX idx_conv_lead_score ON conversations(organization_id, lead_score DESC)
    WHERE status <> 'closed';

-- +goose Down
DROP INDEX IF EXISTS idx_conv_lead_score;
ALTER TABLE conversations
    DROP COLUMN IF EXISTS lead_summary,
    DROP COLUMN IF EXISTS lead_priority,
    DROP COLUMN IF EXISTS suggested_action,
    DROP COLUMN IF EXISTS suggested_action_reason,
    DROP COLUMN IF EXISTS suggested_action_confidence,
    DROP COLUMN IF EXISTS lead_score,
    DROP COLUMN IF EXISTS lead_score_model_version,
    DROP COLUMN IF EXISTS lead_score_at;
