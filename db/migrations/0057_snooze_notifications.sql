-- +goose Up
-- Snooze: a conversation can be parked until snoozed_until, then auto-reopened by
-- the conversation-service ticker (status 'snoozed' -> 'open') with a notification.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS snoozed_until timestamptz;
CREATE INDEX IF NOT EXISTS idx_conv_snoozed ON conversations(snoozed_until)
  WHERE status = 'snoozed';

-- In-app notifications surfaced in the bell dropdown (top-right). user_id is the
-- recipient; conversation_id deep-links the click. read_at marks it read.
CREATE TABLE IF NOT EXISTS notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            text NOT NULL,           -- snooze_due | assigned | ...
  title           text NOT NULL,
  body            text,
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
  read_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id) WHERE read_at IS NULL;

-- +goose Down
DROP TABLE IF EXISTS notifications;
ALTER TABLE conversations DROP COLUMN IF EXISTS snoozed_until;
