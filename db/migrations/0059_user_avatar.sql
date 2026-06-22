-- +goose Up
-- User profile avatar (uploaded image URL). Null = fall back to initials.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text;

-- +goose Down
ALTER TABLE users DROP COLUMN IF EXISTS avatar_url;
