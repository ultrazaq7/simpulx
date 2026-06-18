-- +goose Up
-- Per-campaign calling toggle: lets each campaign independently control whether
-- agents see the call button (effective = channel.calling_enabled AND campaign.calling_enabled).
-- Default true so existing campaigns keep inheriting from the channel.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS calling_enabled boolean NOT NULL DEFAULT true;
