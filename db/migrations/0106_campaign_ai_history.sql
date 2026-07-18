-- +goose Up
-- Prompt versioning (P7 internal tool). Every time a campaign's AI style/prompt
-- (ai_style) changes, append a snapshot here so a founder can see how a campaign's
-- AI behavior evolved and copy an older version back if a change regressed. Append-
-- only; the campaigns.ai_style column stays the live value.
CREATE TABLE IF NOT EXISTS campaign_ai_history (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  ai_style     jsonb NOT NULL,
  changed_by   uuid,                 -- user who saved the change (nullable = system)
  changed_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_campaign_ai_history ON campaign_ai_history(campaign_id, changed_at DESC);

-- +goose Down
DROP TABLE IF EXISTS campaign_ai_history;
