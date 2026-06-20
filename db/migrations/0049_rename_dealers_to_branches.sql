-- +goose Up
-- Rename the "dealer" sub-unit concept to the generic "branch" (Simpulx is not
-- automotive-only). Tables/columns from 0048 are renamed in place; they are
-- brand new and empty, so this is a pure rename with no data migration.
ALTER TABLE campaign_dealers RENAME TO campaign_branches;
ALTER TABLE dealer_agents    RENAME TO branch_agents;
ALTER TABLE branch_agents    RENAME COLUMN dealer_id TO branch_id;
ALTER TABLE conversations    RENAME COLUMN dealer_id TO branch_id;
ALTER TABLE web_api_sources  RENAME COLUMN dealer_id TO branch_id;

ALTER INDEX IF EXISTS idx_campaign_dealers_campaign RENAME TO idx_campaign_branches_campaign;
ALTER INDEX IF EXISTS idx_campaign_dealers_org      RENAME TO idx_campaign_branches_org;
ALTER INDEX IF EXISTS idx_dealer_agents_user        RENAME TO idx_branch_agents_user;
ALTER INDEX IF EXISTS idx_conv_dealer               RENAME TO idx_conv_branch;
