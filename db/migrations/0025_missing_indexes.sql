-- 0025_missing_indexes.sql
-- Missing indexes for Production Hardening

-- +goose Up

-- Mempercepat query unassigned messages (mencegah Seq Scan pada filter ini)
CREATE INDEX IF NOT EXISTS idx_conversations_unassigned ON conversations(assigned_agent_id) WHERE assigned_agent_id IS NULL AND status = 'open';

-- Mempercepat filter inbox agen (status + assigned)
CREATE INDEX IF NOT EXISTS idx_conversations_agent_status ON conversations(assigned_agent_id, status);

-- 1. Index for SLA queries (used by runAggressiveNotifications)
CREATE INDEX IF NOT EXISTS idx_conv_sla ON conversations(organization_id, is_bot_active, status, last_contact_message_at) 
WHERE status = 'open';

-- 2. Index for Campaign Agents routing
CREATE INDEX IF NOT EXISTS idx_campaign_agents_user ON campaign_agents(user_id);
