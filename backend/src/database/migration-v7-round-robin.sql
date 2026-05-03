-- Migration V7: Round Robin Assignment
-- Adds round robin availability flag to users and pointer to departments

ALTER TABLE users ADD COLUMN IF NOT EXISTS available_for_round_robin BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS last_round_robin_agent_id UUID;
