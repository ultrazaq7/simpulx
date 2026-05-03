-- ============================================================
-- Migration V3: Add Referral / Ad Set Columns to Conversations
-- Phase 5.5 — Multi-Thread Conversations (Ad Set Isolation)
-- ============================================================

-- Add referral columns to conversations table
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS referral_ad_set_id VARCHAR(255);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS referral_campaign_id VARCHAR(255);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS referral_source_url TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS referral_headline VARCHAR(500);

-- Index for fast lookup: org + contact + ad set (the thread isolation key)
CREATE INDEX IF NOT EXISTS idx_conversations_referral
  ON conversations(organization_id, contact_id, referral_ad_set_id);
