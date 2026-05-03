-- ============================================================
-- Migration v8: Rename "dispositions" to "stages"
--   - Renames table dispositions -> stages
--   - Renames FK column conversations.disposition_id -> stage_id
--   - Adds color (hex) and category ('progressing'|'lost') columns
--   - Auto-maps category by name on existing rows
--   - Drops free-text group_name column
-- Run inside one transaction so partial failure rolls back.
-- ============================================================

BEGIN;

-- 1) Rename the table
ALTER TABLE dispositions RENAME TO stages;

-- 2) Add new required columns (default lets the NOT NULL constraint succeed for existing rows)
ALTER TABLE stages ADD COLUMN color VARCHAR(7) NOT NULL DEFAULT '#3B82F6';
ALTER TABLE stages ADD COLUMN category VARCHAR(20) NOT NULL DEFAULT 'progressing';

-- 3) Auto-classify existing rows: terminal-sounding names -> 'lost', everything else stays 'progressing'
UPDATE stages
SET category = 'lost'
WHERE LOWER(name) ~ '(lost|closed|rejected|no\s*reply|spam|invalid|cancel|unqualified|drop)';

-- 4) Drop the old free-text grouping column (replaced by category)
ALTER TABLE stages DROP COLUMN IF EXISTS group_name;

-- 5) Rename FK column on conversations
ALTER TABLE conversations RENAME COLUMN disposition_id TO stage_id;

-- 6) Rename any FK constraints that referenced the old name
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT constraint_name
    FROM information_schema.table_constraints
    WHERE table_name = 'conversations'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name LIKE '%disposition%'
  LOOP
    EXECUTE format(
      'ALTER TABLE conversations RENAME CONSTRAINT %I TO %I',
      rec.constraint_name,
      replace(rec.constraint_name, 'disposition', 'stage')
    );
  END LOOP;
END $$;

-- 7) Rename any indexes that referenced the old name
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND indexname LIKE '%disposition%'
  LOOP
    EXECUTE format(
      'ALTER INDEX %I RENAME TO %I',
      rec.indexname,
      replace(rec.indexname, 'disposition', 'stage')
    );
  END LOOP;
END $$;

COMMIT;
