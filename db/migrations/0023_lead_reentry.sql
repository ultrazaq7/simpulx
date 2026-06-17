-- +goose Up
-- Mencegah kontak memiliki lebih dari satu percakapan aktif di campaign yang sama
CREATE UNIQUE INDEX idx_conv_active_contact_campaign 
    ON conversations (contact_id, campaign_id) 
    WHERE status <> 'closed' AND campaign_id IS NOT NULL;

-- Mencegah kontak memiliki lebih dari satu percakapan aktif yang BELUM punya campaign (no-signal)
CREATE UNIQUE INDEX idx_conv_active_contact_no_campaign 
    ON conversations (contact_id) 
    WHERE status <> 'closed' AND campaign_id IS NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_conv_active_contact_campaign;
DROP INDEX IF EXISTS idx_conv_active_contact_no_campaign;
