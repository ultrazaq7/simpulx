-- +goose Up
-- ============================================================
-- 0101: low-credit alert dedup timestamps
-- ============================================================
-- A background worker emails the org owner when credits run low, at two levels:
--   org pool   -> monthly Simpuler usage nears the org quota (resets each month)
--   campaign   -> a campaign's remaining allocation drops to its threshold
-- These columns dedup the emails so the owner is not spammed every tick:
--   org_subscriptions.low_credit_alerted_at  -> last org-pool alert; re-arms when
--       a new calendar month starts (usage is counted per month).
--   campaign_credits.low_credit_alerted_at   -> last campaign alert; cleared back
--       to NULL when the campaign is topped up above threshold, so the next
--       draining episode alerts once more.
ALTER TABLE org_subscriptions ADD COLUMN IF NOT EXISTS low_credit_alerted_at timestamptz;
ALTER TABLE campaign_credits  ADD COLUMN IF NOT EXISTS low_credit_alerted_at timestamptz;

-- +goose Down
ALTER TABLE org_subscriptions DROP COLUMN IF EXISTS low_credit_alerted_at;
ALTER TABLE campaign_credits  DROP COLUMN IF EXISTS low_credit_alerted_at;
