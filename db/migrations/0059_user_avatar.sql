-- User profile avatar (uploaded image URL). Null = fall back to initials.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text;
