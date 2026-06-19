-- +goose Up
-- Store the click-to-WhatsApp ad's source URL (the real ad link) alongside the
-- referral source id, so the Contacts table can show an accurate Source URL.
ALTER TABLE conversation_attributions ADD COLUMN IF NOT EXISTS referral_url text;
