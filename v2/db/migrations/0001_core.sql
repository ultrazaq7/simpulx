-- ============================================================
-- Simpulx v2 — Core schema (multi-tenant omnichannel + CRM)
-- Mempertahankan domain v1: organizations, users, contacts,
-- conversations (window WhatsApp 24h), messages.
-- ============================================================

-- ── Organizations (tenant) ──────────────────────────────────
CREATE TABLE organizations (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        varchar(255) NOT NULL,
    slug        varchar(120) UNIQUE NOT NULL,
    plan        varchar(40)  NOT NULL DEFAULT 'free',
    settings    jsonb        NOT NULL DEFAULT '{}',
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now()
);

-- ── Users / agents ──────────────────────────────────────────
CREATE TABLE users (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email           varchar(255) NOT NULL,
    password_hash   varchar(255) NOT NULL,         -- argon2id
    full_name       varchar(255) NOT NULL,
    role            varchar(20)  NOT NULL DEFAULT 'agent',   -- owner|admin|agent
    status          varchar(20)  NOT NULL DEFAULT 'active',  -- active|inactive
    is_online       boolean      NOT NULL DEFAULT false,
    last_seen_at    timestamptz,
    last_login_at   timestamptz,
    created_at      timestamptz  NOT NULL DEFAULT now(),
    updated_at      timestamptz  NOT NULL DEFAULT now(),
    UNIQUE (organization_id, email)
);
CREATE INDEX idx_users_org ON users(organization_id);

-- ── Departments / teams ─────────────────────────────────────
CREATE TABLE departments (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            varchar(120) NOT NULL,
    created_at      timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX idx_departments_org ON departments(organization_id);

-- ── Contacts ────────────────────────────────────────────────
CREATE TABLE contacts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    full_name       varchar(255),
    phone           varchar(40),          -- E.164 (wa)
    email           varchar(255),
    source_channel  varchar(30),          -- whatsapp|instagram|web_chat|...
    external_ids    jsonb NOT NULL DEFAULT '{}',  -- {wa_id, ig_id, ...}
    attributes      jsonb NOT NULL DEFAULT '{}',
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, phone)
);
CREATE INDEX idx_contacts_org ON contacts(organization_id);

-- ── Conversations ───────────────────────────────────────────
CREATE TABLE conversations (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    contact_id          uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    assigned_agent_id   uuid REFERENCES users(id) ON DELETE SET NULL,
    department_id       uuid REFERENCES departments(id) ON DELETE SET NULL,
    channel             varchar(30)  NOT NULL DEFAULT 'whatsapp',
    channel_id          uuid,         -- FK ke channels (constraint di akhir file)
    status              varchar(20)  NOT NULL DEFAULT 'open',   -- open|pending|closed
    subject             varchar(500),
    last_message_at         timestamptz,
    last_contact_message_at timestamptz,
    last_agent_message_at   timestamptz,
    last_message_preview    text,
    unread_count        integer NOT NULL DEFAULT 0,

    -- WhatsApp 24h service window (HSM/template di luar window)
    window_expires_at   timestamptz,
    hsm_sent_at         timestamptz,
    hsm_count           integer NOT NULL DEFAULT 0,

    -- AI-first
    is_bot_active       boolean NOT NULL DEFAULT true,
    ai_agent_id         uuid,                       -- FK ditambah di 0002_ai.sql
    ai_stage            varchar(30),
    ai_confidence       numeric(5,4),
    ai_reason           text,
    ai_analyzed_at      timestamptz,
    handoff_at          timestamptz,
    handoff_reason      varchar(255),

    metadata            jsonb NOT NULL DEFAULT '{}',
    closed_at           timestamptz,
    closed_reason       varchar(80),
    
    -- SLA & Analytics
    first_responsed_at  timestamptz,
    call_attempts       integer NOT NULL DEFAULT 0,
    total_call_duration integer NOT NULL DEFAULT 0,
    followup_count      integer NOT NULL DEFAULT 0,
    lost_reason         varchar(255),
    
    -- Lead Qualification
    car_brand           varchar(100),
    car_model           varchar(100),
    city                varchar(100),
    purchase_timeframe  varchar(100),

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_conv_org_status ON conversations(organization_id, status);
CREATE INDEX idx_conv_contact ON conversations(contact_id);
CREATE INDEX idx_conv_last_msg ON conversations(organization_id, last_message_at DESC);

-- ── Messages ────────────────────────────────────────────────
CREATE TABLE messages (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    direction       varchar(10) NOT NULL,            -- inbound|outbound
    sender_type     varchar(20) NOT NULL,            -- contact|agent|bot|system
    sender_id       uuid,                            -- user id bila agent
    type            varchar(20) NOT NULL DEFAULT 'text',  -- text|image|audio|video|document|template
    body            text,
    media_url       text,
    status          varchar(20) NOT NULL DEFAULT 'sent',  -- queued|sent|delivered|read|failed
    external_id     varchar(255),                    -- wamid dari Meta
    metadata        jsonb NOT NULL DEFAULT '{}',
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_msg_conv ON messages(conversation_id, created_at);
CREATE INDEX idx_msg_external ON messages(external_id);

-- ── Channels (WhatsApp Cloud API config per org) ────────────
CREATE TABLE channels (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    type                varchar(30) NOT NULL DEFAULT 'whatsapp',
    name                varchar(120) NOT NULL,
    phone_number_id     varchar(64),     -- WA Cloud API phone number id
    waba_id             varchar(64),
    access_token        text,            -- terenkripsi di prod
    is_active           boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (phone_number_id)
);
CREATE INDEX idx_channels_org ON channels(organization_id);

-- FK conversations.channel_id (channels dibuat setelah conversations)
ALTER TABLE conversations
    ADD CONSTRAINT fk_conv_channel
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE SET NULL;
