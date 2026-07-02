-- +goose Up
-- Enable AI auto-reply by default (AI-first). The reply/nurture path is gated by
-- campaigns.ai_auto_reply (added in 0071 with DEFAULT false). This turns it ON for
-- existing campaigns and makes new campaigns opt-in-by-default. The per-campaign
-- toggle in Campaign settings can still switch it OFF for any campaign.
-- NOTE: this affects ALL campaigns in ALL orgs; AI will start replying to inbound
-- leads on those campaigns (requires an active ai_agents row so conversations get
-- an ai_agent_id, and is_bot_active stays true until a human replies).
ALTER TABLE campaigns ALTER COLUMN ai_auto_reply SET DEFAULT true;
UPDATE campaigns SET ai_auto_reply = true WHERE ai_auto_reply = false;

-- +goose Down
ALTER TABLE campaigns ALTER COLUMN ai_auto_reply SET DEFAULT false;
