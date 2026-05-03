-- Migration v7: Dispositions
-- Add dispositions table and disposition_id to conversations

CREATE TABLE IF NOT EXISTS dispositions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dispositions_org ON dispositions(organization_id);

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS disposition_id UUID REFERENCES dispositions(id) ON DELETE SET NULL;
