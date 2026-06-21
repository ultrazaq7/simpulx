-- +goose Up
-- Separate "member of a campaign" (visibility / oversight) from "in the
-- round-robin rotation" (receives leads). Managers/SPV can be added to a campaign
-- to supervise it (in_rotation=false) without being handed leads; agents (and any
-- manager who should also sell) get in_rotation=true. Default true keeps every
-- existing member in rotation (backward compatible).
ALTER TABLE campaign_agents ADD COLUMN IF NOT EXISTS in_rotation boolean NOT NULL DEFAULT true;
ALTER TABLE branch_agents   ADD COLUMN IF NOT EXISTS in_rotation boolean NOT NULL DEFAULT true;

-- +goose Down
ALTER TABLE campaign_agents DROP COLUMN IF EXISTS in_rotation;
ALTER TABLE branch_agents   DROP COLUMN IF EXISTS in_rotation;
