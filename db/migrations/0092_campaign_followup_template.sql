-- +goose Up
-- Follow-up template (WS-E / B): the approved WhatsApp template the auto follow-up
-- uses for out-of-window touches (1d/3d/7d), where free-form messages aren't
-- allowed. NULL = no template configured (those touches are skipped).
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS followup_template_id uuid
    REFERENCES message_templates(id) ON DELETE SET NULL;

-- +goose Down
ALTER TABLE campaigns DROP COLUMN IF EXISTS followup_template_id;
