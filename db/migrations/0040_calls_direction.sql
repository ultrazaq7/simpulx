-- +goose Up
-- WhatsApp Business Calling API now supports BOTH directions:
--   outbound = business-initiated (agent calls the customer)
--   inbound  = user-initiated  (customer calls the business number -> rings the
--              conversation's assigned agent)
-- Track which side started the call so the SDP offer/answer roles and the
-- webhook lifecycle can be handled correctly.
ALTER TABLE calls ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'outbound';
CREATE INDEX IF NOT EXISTS idx_calls_agent ON calls(agent_id);
