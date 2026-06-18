-- +goose Up
-- Sample media for media headers (IMAGE/VIDEO/DOCUMENT). Stored as our object
-- storage URL; at submit time it is uploaded to Meta's resumable upload API to
-- obtain the header_handle required to register the template.
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS header_media_url text;
