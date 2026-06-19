-- +goose Up
-- Platform-specific extras for ad accounts (e.g. Google Ads needs a developer
-- token, login-customer-id and an OAuth client to refresh tokens for the cron).
ALTER TABLE ad_accounts ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb;
