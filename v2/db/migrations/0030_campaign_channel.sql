-- +goose Up
-- Wire a CHANNEL to each campaign: the campaign's leads flow through this channel,
-- and the channel is a hard dependency for routing. Also flag which channels have
-- WhatsApp calling enabled (gates the in-conversation call button until OTO's
-- number has the WhatsApp Business Calling API turned on).
ALTER TABLE channels ADD COLUMN IF NOT EXISTS calling_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES channels(id) ON DELETE SET NULL;
