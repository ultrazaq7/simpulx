-- +goose Up
-- Refresh tokens for the access/refresh auth flow. The access JWT stays short
-- lived; the client exchanges this opaque refresh token at /auth/refresh for a
-- fresh access token (with rotation) so the user is never logged out mid-session.
-- Only a SHA-256 hash of the token is stored, so a DB leak can't replay it.
-- Tokens are revocable (logout, deactivate/delete user, rotation), unlike a JWT.
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   text NOT NULL UNIQUE,
    expires_at   timestamptz NOT NULL,
    revoked_at   timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz
);

-- Lookups are by hash (refresh) and by user (bulk revoke on logout/deactivate).
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user
    ON refresh_tokens(user_id) WHERE revoked_at IS NULL;

-- +goose Down
DROP TABLE IF EXISTS refresh_tokens;
