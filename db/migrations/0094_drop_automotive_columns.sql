-- +goose Up

-- ============================================================
-- 0094: drop automotive-specific lead columns (segment-agnostic unify)
-- ============================================================
-- brand/model/city/purchase_timeframe now live in conversations.metadata->'lead_fields'
-- for EVERY segment (automotive included), so the dedicated columns are gone —
-- extraction, scoring, grounding, display and export all read lead_fields now.

-- Backfill first so no qualifier data is lost on drop. Merge the legacy column
-- values into metadata.lead_fields under the automotive segment's keys; any
-- lead_fields value already present WINS (it is the fresher canonical source),
-- so this is safe to re-run and never clobbers newer extractions.
UPDATE conversations
   SET metadata = COALESCE(metadata, '{}'::jsonb)
       || jsonb_build_object('lead_fields',
            jsonb_strip_nulls(jsonb_build_object(
                'brand', car_brand,
                'model', car_model,
                'city', city,
                'purchase_timeframe', purchase_timeframe))
            || COALESCE(metadata->'lead_fields', '{}'::jsonb))
 WHERE car_brand IS NOT NULL
    OR car_model IS NOT NULL
    OR city IS NOT NULL
    OR purchase_timeframe IS NOT NULL;

ALTER TABLE conversations DROP COLUMN IF EXISTS car_brand;
ALTER TABLE conversations DROP COLUMN IF EXISTS car_model;
ALTER TABLE conversations DROP COLUMN IF EXISTS city;
ALTER TABLE conversations DROP COLUMN IF EXISTS purchase_timeframe;

-- +goose Down
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS car_brand text;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS car_model text;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS purchase_timeframe text;
