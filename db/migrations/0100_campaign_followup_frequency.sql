-- +goose Up
-- ============================================================
-- 0100: campaigns.followup_frequency — per-campaign follow-up cadence
-- ============================================================
-- The auto follow-up cadence (touch 1 @ 12h, 2 @ 20h, 3 @ 1d, 4 @ 3d, 5 @ 7d) was
-- hardcoded for every campaign. This lets each campaign dial it:
--   off    -> no automatic follow-ups
--   low    -> more relaxed (intervals ~1.8x longer)
--   normal -> the default cadence
--   high   -> more frequent (intervals ~0.5x, nudge sooner)
-- The messaging follow-up worker scales the interval thresholds by this value.
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS followup_frequency text NOT NULL DEFAULT 'normal'
  CHECK (followup_frequency IN ('off', 'low', 'normal', 'high'));

-- +goose Down
ALTER TABLE campaigns DROP COLUMN IF EXISTS followup_frequency;
