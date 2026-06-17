-- +goose Up

-- 0024_messages_partitioning.sql
-- Partition the messages table by month (created_at) for archiving and performance.

-- 1. Rename existing table
ALTER TABLE messages RENAME TO messages_old;

-- 2. Create the new partitioned table (Primary Key must include partition key)
CREATE TABLE messages (
    id              uuid DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    direction       varchar(10) NOT NULL,
    sender_type     varchar(20) NOT NULL,
    sender_id       uuid,
    type            varchar(20) NOT NULL DEFAULT 'text',
    body            text,
    media_url       text,
    status          varchar(20) NOT NULL DEFAULT 'sent',
    external_id     varchar(255),
    metadata        jsonb NOT NULL DEFAULT '{}',
    genuine         boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (id, created_at),
    -- Preserve idempotency constraint
    UNIQUE (organization_id, external_id, created_at)
) PARTITION BY RANGE (created_at);

-- 3. Create partitions for the current and next few months
CREATE TABLE messages_y2026m05 PARTITION OF messages FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE messages_y2026m06 PARTITION OF messages FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE messages_y2026m07 PARTITION OF messages FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE messages_y2026m08 PARTITION OF messages FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE messages_default PARTITION OF messages DEFAULT;

-- 4. Copy data from old table to new partitioned table
INSERT INTO messages (
    id, organization_id, conversation_id, direction, sender_type, sender_id,
    type, body, media_url, status, external_id, metadata, genuine, created_at
)
SELECT 
    id, organization_id, conversation_id, direction, sender_type, sender_id,
    type, body, media_url, status, external_id, metadata, genuine, created_at
FROM messages_old;

-- 5. Drop old table
DROP TABLE messages_old;

-- 6. Re-apply Indexes
CREATE INDEX idx_msg_conv ON messages(conversation_id, created_at);
CREATE INDEX idx_msg_external ON messages(external_id);
