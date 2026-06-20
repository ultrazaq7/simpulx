-- +goose Up
-- Update the sales funnel's last two stages to the new pipeline:
--   New Lead -> Contacted -> Qualified -> Appointment -> Negotiation -> Purchase
-- Display name only; system_key is preserved so the classifier/orchestrator stage
-- mapping and every existing conversation's stage_id stay intact. Org-agnostic +
-- idempotent (operates on any org that still has the old stage names).
UPDATE stages SET name = 'Negotiation' WHERE system_key = 'test_drive';
UPDATE stages SET name = 'Purchase'    WHERE system_key = 'booking';
