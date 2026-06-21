-- +goose Up
-- ============================================================
-- 0055_email_change — verified email-change tokens.
-- A signed-in user requests a new email; we email a single-use,
-- short-lived link to the NEW address. Only the SHA-256 hash is
-- stored. The account email is swapped only when the link is used.
-- ============================================================
CREATE TABLE IF NOT EXISTS email_change_tokens (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    new_email   text NOT NULL,
    token_hash  text NOT NULL,
    expires_at  timestamptz NOT NULL,
    used_at     timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_emailchange_hash ON email_change_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_emailchange_user ON email_change_tokens(user_id);

-- +goose Down
DROP TABLE IF EXISTS email_change_tokens;
