-- +goose Up
-- Track the furthest pipeline stage each conversation has ever reached, so the
-- lead funnel can count a lost lead at the stage it actually got to (e.g. a lead
-- lost after reaching Appointment still counts through New Lead..Appointment),
-- instead of collapsing every lost lead to the entry stage.
-- The Lost stage has sort_order 0, so being moved to Lost never lowers this value.
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS max_reached_sort_order int NOT NULL DEFAULT 0;

-- Maintain it on every stage change regardless of code path (manual PATCH,
-- messaging auto-advance, automation, ...). A trigger is used so no write site
-- can forget to update it.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION bump_max_reached_sort_order() RETURNS trigger AS $$
BEGIN
  IF NEW.stage_id IS NOT NULL THEN
    NEW.max_reached_sort_order := GREATEST(
      COALESCE(NEW.max_reached_sort_order, 0),
      COALESCE((SELECT sort_order FROM stages WHERE id = NEW.stage_id), 0)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_bump_max_reached ON conversations;
CREATE TRIGGER trg_bump_max_reached
  BEFORE INSERT OR UPDATE OF stage_id ON conversations
  FOR EACH ROW EXECUTE FUNCTION bump_max_reached_sort_order();

-- Backfill 1: seed from each conversation's CURRENT stage.
UPDATE conversations cv
   SET max_reached_sort_order = GREATEST(cv.max_reached_sort_order, COALESCE(s.sort_order, 0))
  FROM stages s
 WHERE s.id = cv.stage_id;

-- Backfill 2: raise to the furthest stage recorded in the timeline history
-- (stage_changed events), so leads that progressed then were lost are captured.
UPDATE conversations cv
   SET max_reached_sort_order = GREATEST(cv.max_reached_sort_order, h.max_so)
  FROM (
    SELECT e.conversation_id, max(s.sort_order) AS max_so
      FROM conversation_events e
      JOIN stages s ON s.id = (e.detail->>'stage_id')::uuid
     WHERE e.type = 'stage_changed' AND e.detail->>'stage_id' IS NOT NULL
     GROUP BY e.conversation_id
  ) h
 WHERE h.conversation_id = cv.id;

-- +goose Down
DROP TRIGGER IF EXISTS trg_bump_max_reached ON conversations;
DROP FUNCTION IF EXISTS bump_max_reached_sort_order();
ALTER TABLE conversations DROP COLUMN IF EXISTS max_reached_sort_order;
