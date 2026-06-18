-- +goose Up
-- Per-campaign template scoping. A template is already optionally bound to a
-- channel (message_templates.channel_id). This adds a many-to-many link so the
-- same template can be enabled for one or more campaigns on that channel.
--
-- Visibility rule (enforced in the API):
--   * a template with NO rows here  -> available to ALL campaigns on its channel
--     (or all campaigns org-wide when channel_id is also null).
--   * a template WITH rows here     -> available only to the linked campaigns.
CREATE TABLE IF NOT EXISTS template_campaigns (
    template_id uuid NOT NULL REFERENCES message_templates(id) ON DELETE CASCADE,
    campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    PRIMARY KEY (template_id, campaign_id)
);
CREATE INDEX IF NOT EXISTS idx_template_campaigns_campaign ON template_campaigns(campaign_id);
