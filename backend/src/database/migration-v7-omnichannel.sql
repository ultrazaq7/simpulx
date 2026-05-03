-- ============================================================
-- Migration V7: Omnichannel CRM — Meta Integration & Conversion Tracking
-- Run: psql -U simpulx -d simpulx_crm -f migration-v7-omnichannel.sql
-- ============================================================

BEGIN;

-- ============================================================
-- 1. SOURCE CHANNEL ENUM
-- ============================================================
CREATE TYPE source_channel AS ENUM (
  'WHATSAPP_DIRECT',
  'META_ADS',
  'META_ORGANIC',
  'META_MESSENGER',
  'TIKTOK_ADS',
  'GOOGLE_ADS',
  'INSTAGRAM',
  'LANDING_PAGE',
  'PUBLISHER',
  'REFERRAL',
  'EMAIL',
  'FORM',
  'MANUAL'
);

-- ============================================================
-- 2. ADD LEAD SOURCE & CONVERSION FIELDS TO CONTACTS
-- ============================================================
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS source_channel       source_channel DEFAULT 'WHATSAPP_DIRECT',
  ADD COLUMN IF NOT EXISTS source_campaign_id   VARCHAR(255),
  ADD COLUMN IF NOT EXISTS source_campaign_name VARCHAR(500),
  ADD COLUMN IF NOT EXISTS source_metadata      JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS first_contacted_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS converted_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS conversion_value     DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS conversion_metadata  JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cross_channel_group_id UUID;

-- Indexes for contact attribution & matching
CREATE INDEX IF NOT EXISTS idx_contacts_source_channel ON contacts(organization_id, source_channel);
CREATE INDEX IF NOT EXISTS idx_contacts_cross_channel ON contacts(cross_channel_group_id) WHERE cross_channel_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_email_match ON contacts(organization_id, email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_converted ON contacts(organization_id, converted_at) WHERE converted_at IS NOT NULL;

-- ============================================================
-- 3. EXTEND CONVERSATION MODEL
-- ============================================================

-- Add meta_messenger to conversation_channel enum
ALTER TYPE conversation_channel ADD VALUE IF NOT EXISTS 'meta_messenger';

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS source_channel         source_channel,
  ADD COLUMN IF NOT EXISTS cross_channel_group_id UUID;

CREATE INDEX IF NOT EXISTS idx_conversations_source ON conversations(organization_id, source_channel);
CREATE INDEX IF NOT EXISTS idx_conversations_cross_channel ON conversations(cross_channel_group_id) WHERE cross_channel_group_id IS NOT NULL;

-- ============================================================
-- 4. CHANNEL INTERACTIONS TABLE (audit trail / timeline)
-- ============================================================
CREATE TYPE interaction_type AS ENUM (
  'LEAD_CREATED',
  'MESSAGE_RECEIVED',
  'MESSAGE_SENT',
  'CONVERSATION_OPENED',
  'CONVERSATION_CLOSED',
  'AD_CLICK',
  'FORM_SUBMITTED',
  'CONVERSION',
  'NOTE_ADDED'
);

CREATE TABLE IF NOT EXISTS channel_interactions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  channel         source_channel NOT NULL,
  interaction_type interaction_type NOT NULL,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_channel_interactions_contact ON channel_interactions(contact_id, created_at DESC);
CREATE INDEX idx_channel_interactions_org ON channel_interactions(organization_id, created_at DESC);

-- ============================================================
-- 5. CONVERSION EVENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS conversion_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  channel_credited source_channel NOT NULL,
  amount          DECIMAL(12,2) DEFAULT 0,
  metadata        JSONB DEFAULT '{}',
  converted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conversion_events_org ON conversion_events(organization_id, converted_at DESC);
CREATE INDEX idx_conversion_events_contact ON conversion_events(contact_id);
CREATE INDEX idx_conversion_events_channel ON conversion_events(organization_id, channel_credited);

-- ============================================================
-- 6. CONVERSION FUNNEL TABLE (pre-computed analytics)
-- ============================================================
CREATE TABLE IF NOT EXISTS conversion_funnels (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period              DATE NOT NULL,
  channel             source_channel NOT NULL,
  leads_count         INT NOT NULL DEFAULT 0,
  conversations_count INT NOT NULL DEFAULT 0,
  conversions_count   INT NOT NULL DEFAULT 0,
  total_value         DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, period, channel)
);

CREATE INDEX idx_conversion_funnels_lookup ON conversion_funnels(organization_id, period DESC, channel);

-- ============================================================
-- 7. META ACCOUNTS TABLE (per organization)
-- ============================================================
CREATE TABLE IF NOT EXISTS meta_accounts (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  platform                VARCHAR(20) NOT NULL DEFAULT 'facebook',  -- facebook / instagram
  business_account_id     VARCHAR(100) NOT NULL,
  page_id                 VARCHAR(100),
  page_name               VARCHAR(255),
  access_token            TEXT NOT NULL,
  webhook_verify_token    VARCHAR(255),
  is_active               BOOLEAN NOT NULL DEFAULT true,
  last_synced_at          TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, business_account_id)
);

-- ============================================================
-- 8. META LEADS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS meta_leads (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  meta_account_id     UUID NOT NULL REFERENCES meta_accounts(id) ON DELETE CASCADE,
  contact_id          UUID REFERENCES contacts(id) ON DELETE SET NULL,
  meta_lead_id        VARCHAR(100) NOT NULL,
  form_id             VARCHAR(100),
  form_name           VARCHAR(255),
  ad_id               VARCHAR(100),
  ad_name             VARCHAR(255),
  adset_id            VARCHAR(100),
  adset_name          VARCHAR(255),
  campaign_id         VARCHAR(100),
  campaign_name       VARCHAR(255),
  platform            VARCHAR(20) NOT NULL DEFAULT 'facebook',
  lead_data           JSONB DEFAULT '{}',
  status              VARCHAR(20) NOT NULL DEFAULT 'new',  -- new, contacted, qualified, converted, lost
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, meta_lead_id)
);

CREATE INDEX idx_meta_leads_org ON meta_leads(organization_id, created_at DESC);
CREATE INDEX idx_meta_leads_contact ON meta_leads(contact_id);
CREATE INDEX idx_meta_leads_campaign ON meta_leads(organization_id, campaign_id);

-- ============================================================
-- 9. PUBLISHERS TABLE (configurable lead sources)
-- ============================================================
CREATE TABLE IF NOT EXISTS publishers (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                VARCHAR(255) NOT NULL,
  slug                VARCHAR(100) NOT NULL,
  api_key             VARCHAR(64) NOT NULL UNIQUE,
  auto_assign_dept_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  auto_template_name  VARCHAR(255),
  webhook_url         TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  metadata            JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, slug)
);

CREATE INDEX idx_publishers_api_key ON publishers(api_key);
CREATE INDEX idx_publishers_org ON publishers(organization_id);

-- ============================================================
-- 10. BACKFILL EXISTING DATA
-- ============================================================

-- Set source_channel for existing contacts
UPDATE contacts
SET source_channel = 'WHATSAPP_DIRECT',
    first_contacted_at = COALESCE(first_seen_at, created_at)
WHERE source_channel IS NULL OR first_contacted_at IS NULL;

-- Set cross_channel_group_id = contact id for existing contacts (1:1 initially)
UPDATE contacts
SET cross_channel_group_id = id
WHERE cross_channel_group_id IS NULL;

-- Set source_channel for existing conversations
UPDATE conversations
SET source_channel = 'WHATSAPP_DIRECT'
WHERE source_channel IS NULL;

-- Set cross_channel_group_id for existing conversations (copy from contact)
UPDATE conversations c
SET cross_channel_group_id = ct.cross_channel_group_id
FROM contacts ct
WHERE c.contact_id = ct.id AND c.cross_channel_group_id IS NULL;

COMMIT;
