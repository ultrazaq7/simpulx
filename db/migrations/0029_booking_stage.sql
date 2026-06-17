-- +goose Up
-- Merge SPK + Delivered into a single final stage "Booking".
-- New pipeline: New Lead -> Contacted -> Qualified -> Appointment -> Test Drive -> Booking.
-- "Booking" (the max sort_order stage) is the won/success endpoint.
-- Idempotent + org-agnostic (operates on any org that still has the old stages).

-- 1. Rename SPK -> Booking (keeps the row id + its conversations).
UPDATE stages SET name = 'Booking', system_key = 'booking'
 WHERE system_key = 'spk';

-- 2. Move any conversations sitting on "Delivered" onto that org's Booking stage.
UPDATE conversations cv
   SET stage_id = b.id
  FROM stages d
  JOIN stages b ON b.organization_id = d.organization_id AND b.system_key = 'booking'
 WHERE d.system_key = 'delivered' AND cv.stage_id = d.id;

-- 3. Drop the Delivered stage.
DELETE FROM stages WHERE system_key = 'delivered';
