-- ============================================================
-- 0018: FCM Tokens for Push Notifications
-- ============================================================

CREATE TABLE fcm_tokens (
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token       text NOT NULL,
    platform    varchar(20),
    created_at  timestamptz DEFAULT now(),
    PRIMARY KEY(user_id, token)
);

CREATE INDEX idx_fcm_tokens_user ON fcm_tokens(user_id);
