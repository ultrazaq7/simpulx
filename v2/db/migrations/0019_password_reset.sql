-- +goose Up

-- ============================================================
-- 0019_password_reset — password reset tokens for forgot-password.
-- A token is emailed to the user (SMTP); only its SHA-256 hash is
-- stored, so a DB leak can't be used to reset accounts. Tokens are
-- single-use (used_at) and short-lived (expires_at).
-- ============================================================
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  text NOT NULL,
    expires_at  timestamptz NOT NULL,
    used_at     timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pwreset_hash ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_pwreset_user ON password_reset_tokens(user_id);
