-- ============================================================
-- KLUQ CRM — PostgreSQL Database Schema
-- Omnichannel WhatsApp CRM with Multi-tenancy
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. ORGANIZATIONS (Multi-tenancy root)
-- ============================================================
CREATE TABLE organizations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(100) NOT NULL UNIQUE,
    logo_url        TEXT,
    plan            VARCHAR(50) NOT NULL DEFAULT 'free', -- free, starter, pro, enterprise
    max_agents      INT NOT NULL DEFAULT 3,
    whatsapp_phone_number_id VARCHAR(100),      -- Meta WABA phone number ID
    whatsapp_business_account_id VARCHAR(100),   -- Meta WABA business account ID
    whatsapp_access_token TEXT,                  -- Encrypted Meta API token
    webhook_verify_token VARCHAR(255),           -- For Meta webhook verification
    settings        JSONB NOT NULL DEFAULT '{}', -- Org-level settings
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_organizations_slug ON organizations(slug);

-- ============================================================
-- 2. USERS (Agents & Admins with Roles)
-- ============================================================
CREATE TYPE user_role AS ENUM ('owner', 'admin', 'supervisor', 'agent');
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'invited');

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email           VARCHAR(255) NOT NULL,
    password_hash   TEXT NOT NULL,
    full_name       VARCHAR(255) NOT NULL,
    avatar_url      TEXT,
    role            user_role NOT NULL DEFAULT 'agent',
    status          user_status NOT NULL DEFAULT 'invited',
    max_concurrent_chats INT NOT NULL DEFAULT 10,
    is_online       BOOLEAN NOT NULL DEFAULT false,
    last_seen_at    TIMESTAMPTZ,
    preferences     JSONB NOT NULL DEFAULT '{}', -- Notification settings, theme, etc.
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, email)
);

CREATE INDEX idx_users_org ON users(organization_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(organization_id, role);

-- ============================================================
-- 3. CONTACTS (Customers with metadata)
-- ============================================================
CREATE TABLE contacts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    whatsapp_id     VARCHAR(50),            -- WhatsApp phone number (e.g., 628123456789)
    phone           VARCHAR(50),
    email           VARCHAR(255),
    name            VARCHAR(255),
    avatar_url      TEXT,
    tags            TEXT[] DEFAULT '{}',     -- Array of tag strings
    metadata        JSONB NOT NULL DEFAULT '{}', -- Custom fields (company, address, etc.)
    notes           TEXT,
    is_blocked      BOOLEAN NOT NULL DEFAULT false,
    first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, whatsapp_id)
);

CREATE INDEX idx_contacts_org ON contacts(organization_id);
CREATE INDEX idx_contacts_whatsapp ON contacts(organization_id, whatsapp_id);
CREATE INDEX idx_contacts_phone ON contacts(organization_id, phone);
CREATE INDEX idx_contacts_tags ON contacts USING GIN(tags);

-- ============================================================
-- 4. CONVERSATIONS (Linking contacts to organizations)
-- ============================================================
CREATE TYPE conversation_status AS ENUM ('open', 'pending', 'resolved', 'closed');
CREATE TYPE conversation_channel AS ENUM ('whatsapp', 'web_chat', 'email', 'instagram', 'telegram');

CREATE TABLE conversations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    assigned_agent_id UUID REFERENCES users(id) ON DELETE SET NULL,
    channel         conversation_channel NOT NULL DEFAULT 'whatsapp',
    status          conversation_status NOT NULL DEFAULT 'open',
    subject         VARCHAR(500),
    last_message_at TIMESTAMPTZ,
    last_message_preview TEXT,              -- Truncated preview of last message
    unread_count    INT NOT NULL DEFAULT 0,
    is_bot_active   BOOLEAN NOT NULL DEFAULT false, -- Whether automation/bot is active
    metadata        JSONB NOT NULL DEFAULT '{}',
    closed_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conversations_org ON conversations(organization_id);
CREATE INDEX idx_conversations_contact ON conversations(contact_id);
CREATE INDEX idx_conversations_agent ON conversations(assigned_agent_id);
CREATE INDEX idx_conversations_status ON conversations(organization_id, status);
CREATE INDEX idx_conversations_last_msg ON conversations(organization_id, last_message_at DESC);

-- ============================================================
-- 5. MESSAGES (Content, Type, Status, WhatsApp Message ID)
-- ============================================================
CREATE TYPE message_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE message_type AS ENUM ('text', 'image', 'video', 'audio', 'document', 'location', 'sticker', 'contacts', 'template', 'interactive', 'reaction', 'system');
CREATE TYPE message_status AS ENUM ('pending', 'sent', 'delivered', 'read', 'failed');

CREATE TABLE messages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    sender_type     VARCHAR(20) NOT NULL CHECK (sender_type IN ('agent', 'contact', 'bot', 'system')),
    sender_id       UUID,                       -- user.id if agent, contact.id if contact
    direction       message_direction NOT NULL,
    type            message_type NOT NULL DEFAULT 'text',
    content         TEXT,                        -- Text content or caption
    media_url       TEXT,                        -- URL to media file
    media_mime_type VARCHAR(100),
    media_filename  VARCHAR(255),
    media_size      BIGINT,                      -- File size in bytes
    whatsapp_message_id VARCHAR(255),           -- Meta's wamid for tracking
    status          message_status NOT NULL DEFAULT 'pending',
    metadata        JSONB NOT NULL DEFAULT '{}', -- Template params, interactive buttons, etc.
    reply_to_id     UUID REFERENCES messages(id) ON DELETE SET NULL,
    is_deleted      BOOLEAN NOT NULL DEFAULT false,
    error_code      VARCHAR(50),
    error_message   TEXT,
    sent_at         TIMESTAMPTZ,
    delivered_at    TIMESTAMPTZ,
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_org ON messages(organization_id);
CREATE INDEX idx_messages_wa_id ON messages(whatsapp_message_id);
CREATE INDEX idx_messages_status ON messages(conversation_id, status);

-- ============================================================
-- 6. TICKETS (Linked to conversations)
-- ============================================================
CREATE TYPE ticket_status AS ENUM ('open', 'in_progress', 'waiting_customer', 'waiting_internal', 'resolved', 'closed');
CREATE TYPE ticket_priority AS ENUM ('low', 'medium', 'high', 'urgent');

CREATE TABLE tickets (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    assigned_agent_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ticket_number   SERIAL,                     -- Human-readable ticket number
    subject         VARCHAR(500) NOT NULL,
    status          ticket_status NOT NULL DEFAULT 'open',
    priority        ticket_priority NOT NULL DEFAULT 'medium',
    tags            TEXT[] DEFAULT '{}',
    sla_deadline    TIMESTAMPTZ,                -- SLA due date
    first_response_at TIMESTAMPTZ,
    resolved_at     TIMESTAMPTZ,
    closed_at       TIMESTAMPTZ,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tickets_org ON tickets(organization_id);
CREATE INDEX idx_tickets_conversation ON tickets(conversation_id);
CREATE INDEX idx_tickets_agent ON tickets(assigned_agent_id);
CREATE INDEX idx_tickets_status ON tickets(organization_id, status);
CREATE INDEX idx_tickets_priority ON tickets(organization_id, priority);
CREATE UNIQUE INDEX idx_tickets_number ON tickets(organization_id, ticket_number);

-- ============================================================
-- 7. TICKET COMMENTS (Internal notes on tickets)
-- ============================================================
CREATE TABLE ticket_comments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id       UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content         TEXT NOT NULL,
    is_internal     BOOLEAN NOT NULL DEFAULT true, -- Internal note vs. public reply
    attachments     JSONB DEFAULT '[]',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ticket_comments_ticket ON ticket_comments(ticket_id, created_at);

-- ============================================================
-- 8. AUTOMATION RULES (Triggers and Actions)
-- ============================================================
CREATE TYPE automation_trigger AS ENUM (
    'new_conversation',
    'new_message',
    'conversation_idle',
    'ticket_created',
    'keyword_match',
    'contact_tag',
    'office_hours',
    'after_hours'
);

CREATE TYPE automation_action AS ENUM (
    'assign_agent',
    'assign_team',
    'send_message',
    'send_template',
    'add_tag',
    'remove_tag',
    'set_priority',
    'close_conversation',
    'create_ticket',
    'webhook_notify'
);

CREATE TABLE automation_rules (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    trigger_type    automation_trigger NOT NULL,
    trigger_conditions JSONB NOT NULL DEFAULT '{}',  -- e.g. {"keywords": ["help", "urgent"]}
    actions         JSONB NOT NULL DEFAULT '[]',      -- Array of {action_type, params}
    is_active       BOOLEAN NOT NULL DEFAULT true,
    priority_order  INT NOT NULL DEFAULT 0,          -- Lower number = higher priority
    execution_count BIGINT NOT NULL DEFAULT 0,
    last_executed_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_automation_org ON automation_rules(organization_id);
CREATE INDEX idx_automation_trigger ON automation_rules(organization_id, trigger_type, is_active);

-- ============================================================
-- 9. QUICK REPLIES (Canned responses)
-- ============================================================
CREATE TABLE quick_replies (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    shortcut        VARCHAR(100) NOT NULL,       -- e.g., "/greeting"
    title           VARCHAR(255) NOT NULL,
    content         TEXT NOT NULL,
    category        VARCHAR(100),
    usage_count     INT NOT NULL DEFAULT 0,
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, shortcut)
);

-- ============================================================
-- 10. TEAMS (Agent grouping)
-- ============================================================
CREATE TABLE teams (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, name)
);

CREATE TABLE team_members (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id         UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_lead         BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(team_id, user_id)
);

-- ============================================================
-- 11. AUDIT LOG
-- ============================================================
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    action          VARCHAR(100) NOT NULL,       -- e.g., 'ticket.assigned', 'message.sent'
    entity_type     VARCHAR(100) NOT NULL,       -- e.g., 'ticket', 'conversation'
    entity_id       UUID,
    old_values      JSONB,
    new_values      JSONB,
    ip_address      INET,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_org ON audit_logs(organization_id, created_at DESC);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);

-- ============================================================
-- 12. ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access data from their organization
CREATE POLICY users_org_isolation ON users
    USING (organization_id = current_setting('app.current_org_id')::UUID);

CREATE POLICY contacts_org_isolation ON contacts
    USING (organization_id = current_setting('app.current_org_id')::UUID);

CREATE POLICY conversations_org_isolation ON conversations
    USING (organization_id = current_setting('app.current_org_id')::UUID);

CREATE POLICY messages_org_isolation ON messages
    USING (organization_id = current_setting('app.current_org_id')::UUID);

CREATE POLICY tickets_org_isolation ON tickets
    USING (organization_id = current_setting('app.current_org_id')::UUID);

CREATE POLICY automation_org_isolation ON automation_rules
    USING (organization_id = current_setting('app.current_org_id')::UUID);

-- ============================================================
-- 13. UPDATED_AT TRIGGER FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tickets_updated_at BEFORE UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_automation_rules_updated_at BEFORE UPDATE ON automation_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_quick_replies_updated_at BEFORE UPDATE ON quick_replies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON teams FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ticket_comments_updated_at BEFORE UPDATE ON ticket_comments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
