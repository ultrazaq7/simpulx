-- ============================================================
-- 0009_channels — enrich channels for multi-platform management
-- (WhatsApp + Meta Instagram/Messenger + future Telegram/SMS/...)
-- The dashboard Channels page (SleekFlow-style) reads these.
-- ============================================================

-- Connection state shown as a status dot in the UI.
ALTER TABLE channels ADD COLUMN IF NOT EXISTS status       varchar(20)  NOT NULL DEFAULT 'disconnected';
-- Human-facing identifier (phone number, @handle, page name) for the card subtitle.
ALTER TABLE channels ADD COLUMN IF NOT EXISTS display_id   varchar(160);
-- Platform-specific config: page_id, instagram_account_id, page_name,
-- webhook_verify_token, etc. Keeps the table generic across channel types.
ALTER TABLE channels ADD COLUMN IF NOT EXISTS config       jsonb        NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE channels ADD COLUMN IF NOT EXISTS connected_at timestamptz;
ALTER TABLE channels ADD COLUMN IF NOT EXISTS updated_at   timestamptz  NOT NULL DEFAULT now();

-- The seeded demo WhatsApp channel is wired end-to-end, so mark it connected.
UPDATE channels
   SET status = 'connected',
       display_id = COALESCE(display_id, '+1 234 567 890'),
       connected_at = COALESCE(connected_at, now())
 WHERE id = '00000000-0000-0000-0000-0000000000c1';

CREATE INDEX IF NOT EXISTS idx_channels_org_type ON channels(organization_id, type);
