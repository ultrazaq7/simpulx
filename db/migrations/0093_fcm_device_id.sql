-- +goose Up

-- ============================================================
-- 0093: per-device FCM token dedup
-- ============================================================
-- A `device_id` lets token registration REPLACE a device's previous token
-- instead of accumulating one row per reinstall / token-refresh. Accumulated
-- tokens made FCM push to several (stale) tokens of the SAME device, which the
-- WhatsApp-style MessagingStyle then stacked into a DUPLICATED notification body.
-- Nullable for backward compatibility with older clients that don't send it yet.

ALTER TABLE fcm_tokens ADD COLUMN IF NOT EXISTS device_id text;

CREATE INDEX IF NOT EXISTS idx_fcm_tokens_device ON fcm_tokens(user_id, device_id);
