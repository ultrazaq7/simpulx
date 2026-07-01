-- +goose Up

-- ============================================================
-- 0067_lost_split — split "Lost" into two terminal outcomes:
--   Lost Purchase      (lead was lost but bought elsewhere)
--   Lost Not Purchase  (lead was lost and did not buy)
-- Existing lost leads keep their stage: the current "Lost" is renamed to
-- "Lost Not Purchase". Both stay at sort_order 0 (bottom, excluded from the
-- won/funnel calcs). The specific reason lives in conversations.lost_reason.
-- ============================================================
UPDATE stages SET name = 'Lost Not Purchase', system_key = 'lost_not_purchase'
 WHERE system_key = 'lost';

INSERT INTO stages (organization_id, name, sort_order, system_key)
SELECT o.id, 'Lost Purchase', 0, 'lost_purchase'
  FROM organizations o
 WHERE NOT EXISTS (
   SELECT 1 FROM stages s
    WHERE s.organization_id = o.id AND s.system_key = 'lost_purchase'
 );

-- +goose Down
DELETE FROM stages WHERE system_key = 'lost_purchase';
UPDATE stages SET name = 'Lost', system_key = 'lost' WHERE system_key = 'lost_not_purchase';
