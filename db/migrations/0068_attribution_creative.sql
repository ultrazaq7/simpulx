-- +goose Up
-- Store the click-to-WhatsApp ad creative preview (image/thumbnail + copy) that
-- Meta includes in the referral object for image/video ads, so the ad creative
-- can be previewed in the Marketing dashboard and on the contact record.
ALTER TABLE conversation_attributions ADD COLUMN IF NOT EXISTS referral_image_url  text;
ALTER TABLE conversation_attributions ADD COLUMN IF NOT EXISTS referral_headline   text;
ALTER TABLE conversation_attributions ADD COLUMN IF NOT EXISTS referral_body       text;
ALTER TABLE conversation_attributions ADD COLUMN IF NOT EXISTS referral_media_type text;
