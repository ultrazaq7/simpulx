-- Migration v10: conversation routing lifecycle
-- Adds CTWA/ad-click automation support, WhatsApp window tracking, auto-close
-- metadata, and pending lead queue state.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'automation_trigger') THEN
    ALTER TYPE automation_trigger ADD VALUE IF NOT EXISTS 'ad_click';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'automation_rules_trigger_type_enum') THEN
    ALTER TYPE automation_rules_trigger_type_enum ADD VALUE IF NOT EXISTS 'ad_click';
  END IF;
END $$;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS last_contact_message_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_agent_message_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS window_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_reason VARCHAR(80),
  ADD COLUMN IF NOT EXISTS auto_close_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hsm_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hsm_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_stage VARCHAR(30),
  ADD COLUMN IF NOT EXISTS ai_confidence NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS ai_reason TEXT,
  ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS routing_automation_rule_id UUID REFERENCES automation_rules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS routed_ad_id VARCHAR(255);

CREATE TABLE IF NOT EXISTS pending_leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  source_conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  target_conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  automation_rule_id UUID REFERENCES automation_rules(id) ON DELETE SET NULL,
  ad_id VARCHAR(255),
  source_type VARCHAR(50),
  target_agent_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  reason VARCHAR(80),
  priority INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  triggered_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_conversations_lifecycle
  ON conversations (organization_id, status, auto_close_at, last_contact_message_at);
CREATE INDEX IF NOT EXISTS idx_conversations_window
  ON conversations (organization_id, window_expires_at);
CREATE INDEX IF NOT EXISTS idx_conversations_routed_ad
  ON conversations (organization_id, routed_ad_id);
CREATE INDEX IF NOT EXISTS idx_pending_leads_org_status
  ON pending_leads (organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pending_leads_source_conversation
  ON pending_leads (source_conversation_id, status);
CREATE INDEX IF NOT EXISTS idx_pending_leads_target_conversation
  ON pending_leads (target_conversation_id, status);

DROP TRIGGER IF EXISTS update_pending_leads_updated_at ON pending_leads;
CREATE TRIGGER update_pending_leads_updated_at
  BEFORE UPDATE ON pending_leads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
