-- +goose Up
-- Drop the unused branch coverage/area field. Routing is by ad source, so
-- coverage was informational only and never used; removed to keep things clean.
ALTER TABLE campaign_branches DROP COLUMN IF EXISTS coverage;
