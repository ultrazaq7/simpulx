-- +goose Up
CREATE TABLE outbox_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    topic varchar(255) NOT NULL,
    payload jsonb NOT NULL,
    status varchar(50) NOT NULL DEFAULT 'pending',
    created_at timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz
);
CREATE INDEX idx_outbox_pending ON outbox_events(status, created_at);

-- +goose Down
DROP TABLE IF EXISTS outbox_events;
