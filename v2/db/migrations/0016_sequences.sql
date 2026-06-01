-- ============================================================
-- 0016_sequences — drip / follow-up sequences. A sequence is an
-- ordered set of timed steps. A conversation is enrolled (once) and
-- the conversation service worker sends due steps, stopping if the
-- customer replies (for 'no_reply' sequences).
-- ============================================================
CREATE TABLE sequences (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name             varchar(160) NOT NULL,
    trigger          varchar(20)  NOT NULL DEFAULT 'no_reply', -- no_reply | new_lead
    campaign_id      uuid REFERENCES campaigns(id) ON DELETE SET NULL,  -- null = all campaigns
    is_active        boolean      NOT NULL DEFAULT true,
    created_at       timestamptz  NOT NULL DEFAULT now(),
    updated_at       timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX idx_sequences_org ON sequences(organization_id);

CREATE TABLE sequence_steps (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sequence_id   uuid NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
    step_order    integer NOT NULL,
    delay_minutes integer NOT NULL DEFAULT 60,   -- delay after previous step (or enrollment)
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
    status           varchar(20) NOT NULL DEFAULT 'active', -- active | done | stopped
    enrolled_at      timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (sequence_id, conversation_id)
);
CREATE INDEX idx_seq_enroll_due ON sequence_enrollments(status, next_run_at);

-- Demo follow-up sequence (global, no-reply).
INSERT INTO sequences (id, organization_id, name, trigger) VALUES
 ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', 'No-reply follow-up', 'no_reply');
INSERT INTO sequence_steps (sequence_id, step_order, delay_minutes, body) VALUES
 ('00000000-0000-0000-0000-0000000000d1', 1, 60,   'Hi! Just checking in - are you still interested? Happy to help with any questions.'),
 ('00000000-0000-0000-0000-0000000000d1', 2, 1440, 'Following up once more - let me know if you would like a test drive or a quote.');
