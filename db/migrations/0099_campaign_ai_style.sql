-- +goose Up
-- ============================================================
-- 0099: campaigns.ai_style — per-campaign AI response tuning
-- ============================================================
-- The AI's response style used to come only from the org-wide ai_agents.system_prompt
-- plus a hardcoded segment block, so every campaign sounded the same and there was no
-- easy way to tune tone/goal/rules per campaign. ai_style is a small JSONB the campaign
-- owner edits in the "AI Assistant" tab (or auto-generates with Sonnet); the ai-agent
-- folds it into the nurture/analyze system prompt.
--
-- Shape (all optional; empty {} = use defaults, no change in behaviour):
--   {
--     "persona": "text — who the AI is for this campaign",
--     "tone": "friendly | professional | consultative",
--     "length": "short | medium",
--     "goal": "text — the primary objective (e.g. book a test drive)",
--     "custom_rules": "text — campaign-specific do/don't"
--   }
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ai_style jsonb NOT NULL DEFAULT '{}'::jsonb;

-- +goose Down
ALTER TABLE campaigns DROP COLUMN IF EXISTS ai_style;
