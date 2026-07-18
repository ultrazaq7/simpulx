-- +goose Up
-- Next Best Action (NBA) - the decision layer (services/ai-agent/nba.py). Rules
-- over existing signals (interest_level, closing_probability, lead_score, handoff,
-- field completeness, recency) produce ONE business-facing recommendation the inbox
-- surfaces and sorts by. No LLM: the decision is deterministic (vision: CatBoost/
-- rules decide, LLM only writes language). Nullable => silent until first computed.
ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS next_best_action text,        -- escalate|offer_test_drive|ask_qualification|continue_nurture|schedule_follow_up|wait
    ADD COLUMN IF NOT EXISTS nba_reason        text,       -- 1-sentence why, shown to the agent
    ADD COLUMN IF NOT EXISTS nba_priority      int,        -- higher = more urgent (inbox sort)
    ADD COLUMN IF NOT EXISTS nba_at            timestamptz;

-- "What needs a human next, most urgent first" ordering for the inbox.
CREATE INDEX IF NOT EXISTS idx_conv_nba_priority
    ON conversations(organization_id, nba_priority DESC)
    WHERE next_best_action IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_conv_nba_priority;
ALTER TABLE conversations
    DROP COLUMN IF EXISTS next_best_action,
    DROP COLUMN IF EXISTS nba_reason,
    DROP COLUMN IF EXISTS nba_priority,
    DROP COLUMN IF EXISTS nba_at;
