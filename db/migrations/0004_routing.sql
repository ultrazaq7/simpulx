-- +goose Up

-- ============================================================
-- Simpulx v2 — Fase 2: routing & lifecycle percakapan.
-- agent<->department, dispositions, stages, audit conversation_events.
-- ============================================================

-- ── Keanggotaan agen pada department (untuk scope routing) ──
CREATE TABLE agent_departments (
    user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    department_id uuid NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, department_id)
);
CREATE INDEX idx_agent_dept_dept ON agent_departments(department_id);

-- ── Dispositions (hasil akhir percakapan) ───────────────────
CREATE TABLE dispositions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            varchar(120) NOT NULL,
    category        varchar(40),                 -- won|lost|follow_up|spam|...
    is_terminal     boolean NOT NULL DEFAULT true,
    sort_order      integer NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, name)
);

-- ── Stages (pipeline) ───────────────────────────────────────
CREATE TABLE stages (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            varchar(120) NOT NULL,
    sort_order      integer NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, name)
);

ALTER TABLE conversations
    ADD COLUMN disposition_id uuid REFERENCES dispositions(id) ON DELETE SET NULL,
    ADD COLUMN stage_id       uuid REFERENCES stages(id) ON DELETE SET NULL,
    -- auto-close: percakapan idle melewati waktu ini akan ditutup lifecycle ticker
    ADD COLUMN auto_close_at  timestamptz;

-- ── Audit jejak peristiwa percakapan (assign/close/handoff) ─
CREATE TABLE conversation_events (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    type            varchar(40) NOT NULL,        -- assigned|closed|handoff|reopened
    actor_type      varchar(20) NOT NULL DEFAULT 'system',  -- system|agent|bot
    actor_id        uuid,
    detail          jsonb NOT NULL DEFAULT '{}',
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_conv_events_conv ON conversation_events(conversation_id, created_at);

-- ── Seed dev: departments + agen demo (untuk menguji routing) ─
INSERT INTO departments (id, organization_id, name) VALUES
    ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', 'Support'),
    ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000a1', 'Sales');

-- password_hash placeholder (argon2id dummy; login belum dipakai di Fase 2)
INSERT INTO users (id, organization_id, email, password_hash, full_name, role, status, is_online) VALUES
    ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1', 'agent1@demo.id', '$argon2id$v=19$m=65536,t=3,p=4$placeholder', 'Agent Satu', 'agent', 'active', true),
    ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a1', 'agent2@demo.id', '$argon2id$v=19$m=65536,t=3,p=4$placeholder', 'Agent Dua', 'agent', 'active', true);

INSERT INTO agent_departments (user_id, department_id) VALUES
    ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d2');
