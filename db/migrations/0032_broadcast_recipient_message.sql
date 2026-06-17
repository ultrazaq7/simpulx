-- +goose Up
-- Link each broadcast recipient to the message that was actually sent, so the
-- broadcast report reads real delivered/read status straight from messages
-- (no more best-effort contact+time-window joins). Set by the messaging service
-- once the outbound message is persisted.
--
-- NOTE: messages is a PARTITIONED table (PK includes created_at), so a plain
-- uuid column is used here rather than a FOREIGN KEY (id alone isn't unique).
ALTER TABLE broadcast_recipients
  ADD COLUMN IF NOT EXISTS message_id uuid;
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_message ON broadcast_recipients(message_id);
