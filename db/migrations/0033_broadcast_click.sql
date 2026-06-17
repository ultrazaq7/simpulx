-- +goose Up
-- Broadcast CTA click tracking: each broadcast can send template quick-reply
-- buttons whose callback payload encodes the recipient ("bc_<recipient_id>").
-- When the contact taps a button, the inbound carries that payload and we mark
-- the recipient as clicked here (drives the broadcast report "Clicks").
ALTER TABLE broadcast_recipients
  ADD COLUMN IF NOT EXISTS clicked_at timestamptz,
  ADD COLUMN IF NOT EXISTS clicked_button text;
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_clicked ON broadcast_recipients(broadcast_id) WHERE clicked_at IS NOT NULL;
