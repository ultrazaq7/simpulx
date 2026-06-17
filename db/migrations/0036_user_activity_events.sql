-- +goose Up
-- Append-only activity log: the single source of truth for time-based account
-- metrics. Powers (a) agent-performance presence metrics (online time /
-- availability) and (b) accurate billing active-spans -- both need transition
-- history that the scalar user columns (is_online / is_inactive / is_deleted)
-- cannot provide. One row per real state CHANGE (no-op repeats are not logged).
CREATE TABLE IF NOT EXISTS user_activity_events (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind            text NOT NULL,   -- 'presence' | 'lifecycle'
    event           text NOT NULL,   -- presence: online|offline ; lifecycle: active|inactive|deleted
    actor_id        uuid,            -- who triggered it (self for presence; admin for lifecycle)
    detail          jsonb,
    at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_user_at ON user_activity_events(user_id, at);
CREATE INDEX IF NOT EXISTS idx_activity_org_at  ON user_activity_events(organization_id, at);

-- +goose Down
DROP TABLE IF EXISTS user_activity_events;
