-- +goose Up
-- WS-H: remove the manual drip / sequence feature entirely. The AI assistant now
-- owns follow-up (ai-agent handle_followup) and automation flows cover scripted
-- messaging, so standalone drip sequences collide with the live bot. Backend
-- (gateway sequences.go, conversation drips runner + lifecycle hook, messaging
-- enrollment + add_to_sequence/remove_from_sequence actions) and the web UI were
-- removed in the same change; these tables are the last remnant.
DROP TABLE IF EXISTS sequence_enrollments;
DROP TABLE IF EXISTS sequence_steps;
DROP TABLE IF EXISTS sequences;

-- +goose Down
-- Recreate the sequence tables (0016 schema + 0074 owner_user_id) for rollback.
CREATE TABLE sequences (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name             varchar(160) NOT NULL,
    trigger          varchar(20)  NOT NULL DEFAULT 'no_reply',
    campaign_id      uuid REFERENCES campaigns(id) ON DELETE SET NULL,
    is_active        boolean      NOT NULL DEFAULT true,
    owner_user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at       timestamptz  NOT NULL DEFAULT now(),
    updated_at       timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX idx_sequences_org ON sequences(organization_id);
CREATE INDEX idx_sequences_owner ON sequences(owner_user_id);

CREATE TABLE sequence_steps (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sequence_id   uuid NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
    step_order    integer NOT NULL,
    delay_minutes integer NOT NULL DEFAULT 60,
    body          text NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sequence_steps_seq ON sequence_steps(sequence_id, step_order);

CREATE TABLE sequence_enrollments (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    sequence_id      uuid NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
    conversation_id  uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    contact_id       uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    current_step     integer NOT NULL DEFAULT 0,
    next_run_at      timestamptz,
    status           varchar(20) NOT NULL DEFAULT 'active',
    enrolled_at      timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (sequence_id, conversation_id)
);
CREATE INDEX idx_seq_enroll_due ON sequence_enrollments(status, next_run_at);
