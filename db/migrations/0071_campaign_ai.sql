-- +goose Up
-- Campaign-level AI assistant config. Lets a campaign carry the context the AI
-- auto-reply needs (industry segment + brand), a consistent reply language with
-- optional dynamic switching, an intake form to auto-collect lead details, and a
-- master toggle for whether the AI nurtures leads before an agent takes over.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS segment              text;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS brand                text;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ai_auto_reply        boolean NOT NULL DEFAULT false;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ai_language          text    NOT NULL DEFAULT 'id';   -- id | en
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ai_dynamic_language  boolean NOT NULL DEFAULT true;    -- match the contact's language
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS intake_form_id       uuid;                              -- WA form auto-sent on first AI reply
