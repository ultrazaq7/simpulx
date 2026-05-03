-- Migration v7: Interest Level, First Reply Time, Internal Notes
-- Run on: simpulx_crm database

-- 1. Add interest_level to conversations
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS interest_level VARCHAR(10) DEFAULT NULL;

-- 2. Add first_reply_at to conversations
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS first_reply_at TIMESTAMP DEFAULT NULL;

-- 3. Create internal_notes table
CREATE TABLE IF NOT EXISTS internal_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_name VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_internal_notes_conversation ON internal_notes(conversation_id);
CREATE INDEX IF NOT EXISTS idx_internal_notes_org ON internal_notes(organization_id);
