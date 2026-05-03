-- Migration v7: Follow-Up System
-- Run this on production DB

CREATE TYPE follow_up_status AS ENUM ('pending', 'completed', 'missed', 'cancelled');

CREATE TABLE follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status follow_up_status NOT NULL DEFAULT 'pending',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_follow_ups_org ON follow_ups(organization_id);
CREATE INDEX idx_follow_ups_agent ON follow_ups(agent_id);
CREATE INDEX idx_follow_ups_scheduled ON follow_ups(scheduled_at);
CREATE INDEX idx_follow_ups_status ON follow_ups(status);
CREATE INDEX idx_follow_ups_conversation ON follow_ups(conversation_id);
