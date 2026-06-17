-- +goose Up

-- ============================================================
-- 0011_templates — WhatsApp message templates (HSM) + broadcast
-- template/scheduling support. Mirrors the Meta Cloud API template
-- shape so they can sync to a WABA when real credentials exist.
-- ============================================================
CREATE TABLE message_templates (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    channel_id       uuid REFERENCES channels(id) ON DELETE SET NULL,
    name             varchar(160) NOT NULL,                    -- meta template name (snake_case)
    category         varchar(20)  NOT NULL DEFAULT 'MARKETING',-- MARKETING|UTILITY|AUTHENTICATION
    language         varchar(10)  NOT NULL DEFAULT 'en',
    header_type      varchar(12),                              -- NONE|TEXT|IMAGE|VIDEO|DOCUMENT
    header_text      text,
    body             text NOT NULL,                            -- supports {{1}} {{2}} placeholders
    footer           text,
    buttons          jsonb NOT NULL DEFAULT '[]'::jsonb,       -- [{type,text,url,phone}]
    variables        jsonb NOT NULL DEFAULT '[]'::jsonb,       -- sample values for placeholders
    status           varchar(20)  NOT NULL DEFAULT 'DRAFT',    -- DRAFT|PENDING|APPROVED|REJECTED
    meta_template_id varchar(80),
    rejected_reason  text,
    created_by       uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at       timestamptz  NOT NULL DEFAULT now(),
    updated_at       timestamptz  NOT NULL DEFAULT now(),
    UNIQUE (organization_id, name, language)
);
CREATE INDEX idx_templates_org ON message_templates(organization_id);

-- Broadcasts can now reference a template and be scheduled.
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS template_id  uuid REFERENCES message_templates(id) ON DELETE SET NULL;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;

-- Demo templates.
INSERT INTO message_templates (organization_id, name, category, language, header_type, header_text, body, footer, buttons, variables, status, meta_template_id) VALUES
 ('00000000-0000-0000-0000-0000000000a1',
  'welcome_offer', 'MARKETING', 'en', 'TEXT', 'Welcome to Simpulx 🎉',
  'Hi {{1}}, thanks for joining! Use code {{2}} for 10% off your first order.',
  'Reply STOP to opt out',
  '[{"type":"QUICK_REPLY","text":"Shop now"},{"type":"URL","text":"Visit site","url":"https://example.com"}]'::jsonb,
  '["Andi","WELCOME10"]'::jsonb, 'APPROVED', 'mock-welcome_offer'),
 ('00000000-0000-0000-0000-0000000000a1',
  'order_update', 'UTILITY', 'en', 'NONE', NULL,
  'Hi {{1}}, your order {{2}} is now {{3}}. Track it anytime from your account.',
  NULL, '[]'::jsonb, '["Andi","#10231","shipped"]'::jsonb, 'APPROVED', 'mock-order_update');
