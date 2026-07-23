-- +goose Up
-- Early "make sure" nudge (reviewed on a live lead that went quiet 10 minutes
-- after the bot's question): ONE extra soft follow-up while the lead is still
-- in-session, before the normal 12h cadence starts. Tracked separately from
-- followup_count so the early touch does not consume the long cadence.
ALTER TABLE conversations ADD COLUMN early_nudged boolean NOT NULL DEFAULT false;

-- +goose Down
ALTER TABLE conversations DROP COLUMN early_nudged;
