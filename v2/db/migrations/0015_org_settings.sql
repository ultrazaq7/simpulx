-- +goose Up

-- ============================================================
-- 0015_org_settings — per-organization settings (notifications +
-- branding: dashboard page title / meta title). Stored as jsonb.
-- ============================================================
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Seed defaults for the demo org (branding values mirror v1).
UPDATE organizations
   SET settings = jsonb_build_object(
         'notifications', jsonb_build_object(
            'newMessages', true, 'newConversations', true, 'emailDigest', false, 'sound', true),
         'branding', jsonb_build_object(
            'page_title', 'Simpulx',
            'meta_title', 'Simpulx - Omnichannel WhatsApp Business Platform for Modern Teams')
       )
 WHERE id = '00000000-0000-0000-0000-0000000000a1'
   AND (settings = '{}'::jsonb OR settings IS NULL);
