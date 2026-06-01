-- ============================================================
-- Simpulx v2 - Manual override lock for AI classification.
-- Once a human sets stage/disposition/interest, the AI stops
-- auto-overwriting that conversation's classification.
-- ============================================================

ALTER TABLE conversations
    ADD COLUMN classification_locked boolean NOT NULL DEFAULT false;
