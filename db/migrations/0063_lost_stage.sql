-- +goose Up
-- "Lost" becomes a real pipeline stage so a lost lead's CURRENT STAGE shows
-- "Lost" (visible like Purchase), instead of leaving the stale pre-loss stage.
-- sort_order 0 keeps it out of the "won = max(sort_order)" calc (Booking stays
-- the won stage) and lets the cumulative funnel exclude it cleanly.
INSERT INTO stages (organization_id, name, sort_order, system_key)
SELECT o.id, 'Lost', 0, 'lost'
  FROM organizations o
 WHERE NOT EXISTS (
   SELECT 1 FROM stages s
    WHERE s.organization_id = o.id AND s.system_key = 'lost'
 );

-- +goose Down
DELETE FROM stages WHERE system_key = 'lost';
