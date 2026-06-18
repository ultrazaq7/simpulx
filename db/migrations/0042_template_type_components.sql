-- +goose Up
-- Richer template authoring (matches the WhatsApp/BSP "Create Message Template"
-- flow): a sub-type per template and a generic components blob for structures
-- that don't fit the flat columns (carousel cards, call-permission / contact
-- request metadata).
--   template_type: standard | carousel | call_permission | request_contact
--   components:    e.g. {"cards":[{"media_type":"IMAGE","media_url":"...","body":"...","buttons":[...]}]}
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS template_type text NOT NULL DEFAULT 'standard';
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS components jsonb NOT NULL DEFAULT '{}'::jsonb;
