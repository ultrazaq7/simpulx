-- +goose Up
-- Score-based follow-up reminders: track when the assigned agent was last
-- nudged about a waiting lead and how many times (per "wait"), so we space
-- reminders out and cap them. Reset when the customer sends a new message
-- (see messaging store: persistInbound).
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_followup_notified_at timestamptz;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS followup_notify_count int NOT NULL DEFAULT 0;

-- Snooze pre-expiry reminder: one-shot flag so we ping the agent shortly before
-- a snooze reopens, without resending every tick. Reset on (re)snooze.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS snooze_reminder_sent boolean NOT NULL DEFAULT false;

-- Drives the follow-up sweep efficiently (waiting, human-handled, open leads).
CREATE INDEX IF NOT EXISTS idx_conv_followup_due
  ON conversations(last_contact_message_at)
  WHERE status = 'open' AND assigned_agent_id IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_conv_followup_due;
ALTER TABLE conversations DROP COLUMN IF EXISTS snooze_reminder_sent;
ALTER TABLE conversations DROP COLUMN IF EXISTS followup_notify_count;
ALTER TABLE conversations DROP COLUMN IF EXISTS last_followup_notified_at;
