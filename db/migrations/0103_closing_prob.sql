-- +goose Up
-- Closing Probability (CatBoost) - sibling of lead_score (0026). Predicts the
-- SALES OUTCOME P(booking/purchase), trained on a combined label source: real prod
-- outcomes (booking vs lost) up-weighted, plus a down-weighted SmartKonek CSV proxy
-- to bootstrap before enough real outcomes exist. Serving: closing_score.py.
-- Nullable + no default so the column is a silent no-op until a model is trained.
ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS closing_probability        numeric(5,2),   -- 0..100 P(sale)
    ADD COLUMN IF NOT EXISTS closing_prob_model_version varchar(40),
    ADD COLUMN IF NOT EXISTS closing_prob_at            timestamptz;

-- "Closest to a sale first" ranking for the inbox / Next Best Action.
CREATE INDEX IF NOT EXISTS idx_conv_closing_prob
    ON conversations(organization_id, closing_probability DESC)
    WHERE closing_probability IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_conv_closing_prob;
ALTER TABLE conversations
    DROP COLUMN IF EXISTS closing_probability,
    DROP COLUMN IF EXISTS closing_prob_model_version,
    DROP COLUMN IF EXISTS closing_prob_at;
