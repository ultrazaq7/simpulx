-- ============================================================
-- Migration v8: Meta Channels (Instagram DM + Facebook Messenger)
-- ============================================================

-- 1. Meta Channels table (Instagram pages + Facebook pages)
CREATE TABLE IF NOT EXISTS meta_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    platform VARCHAR(20) NOT NULL DEFAULT 'instagram',  -- 'instagram' | 'messenger'
    name VARCHAR(255) NOT NULL,
    page_id VARCHAR(100) NOT NULL,
    page_name VARCHAR(255),
    instagram_account_id VARCHAR(100),  -- only for instagram
    access_token TEXT NOT NULL,
    webhook_verify_token VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    status VARCHAR(50) DEFAULT 'connected',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meta_channels_org ON meta_channels(organization_id);
CREATE INDEX IF NOT EXISTS idx_meta_channels_page ON meta_channels(page_id);

-- 2. Add instagram_id and facebook_id to contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS instagram_id VARCHAR(100);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS facebook_id VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_contacts_instagram ON contacts(organization_id, instagram_id) WHERE instagram_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_facebook ON contacts(organization_id, facebook_id) WHERE facebook_id IS NOT NULL;

-- 3. Add meta_channel_id to conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS meta_channel_id UUID REFERENCES meta_channels(id) ON DELETE SET NULL;
