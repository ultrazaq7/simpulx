-- Migration v9: CTA (Call-To-Action) event tracking
-- Tracks when agents tap the "Call" or "WhatsApp" buttons on a contact / chat detail
-- and (optionally) the duration of the resulting phone call, so Dashboard can show
-- per-agent / per-source CTA volume and average call duration.

CREATE TABLE IF NOT EXISTS cta_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES users(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  type VARCHAR(20) NOT NULL, -- 'call' | 'whatsapp'
  duration_seconds INTEGER, -- nullable; only set for call events once user confirms duration
  source_channel VARCHAR(50), -- snapshot of contact/conversation source for analytics
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cta_events_org_created ON cta_events (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cta_events_agent ON cta_events (agent_id);
CREATE INDEX IF NOT EXISTS idx_cta_events_contact ON cta_events (contact_id);
CREATE INDEX IF NOT EXISTS idx_cta_events_type ON cta_events (type);
CREATE INDEX IF NOT EXISTS idx_cta_events_source ON cta_events (source_channel);
