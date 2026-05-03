-- ============================================================
-- Migration: Master Plan Implementation
-- Run on production DB before deploying new backend code
-- ============================================================

-- 1. Migrate RESOLVED status to CLOSED (must be done BEFORE enum change)
UPDATE conversations SET status = 'closed' WHERE status = 'resolved';

-- 2. Remove RESOLVED from the conversation_status enum
-- (TypeORM will handle this since synchronize is auto, but for safety:)
-- ALTER TYPE conversation_status RENAME TO conversation_status_old;
-- CREATE TYPE conversation_status AS ENUM ('open', 'pending', 'closed');
-- ALTER TABLE conversations ALTER COLUMN status TYPE conversation_status USING status::text::conversation_status;
-- DROP TYPE conversation_status_old;

-- 3. Follow-Up System
CREATE TYPE follow_up_status AS ENUM ('pending', 'completed', 'missed', 'cancelled');

CREATE TABLE IF NOT EXISTS follow_ups (
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

CREATE INDEX IF NOT EXISTS idx_follow_ups_org ON follow_ups(organization_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_agent ON follow_ups(agent_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_scheduled ON follow_ups(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_follow_ups_status ON follow_ups(status);
CREATE INDEX IF NOT EXISTS idx_follow_ups_conversation ON follow_ups(conversation_id);
