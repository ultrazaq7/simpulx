-- Migration V7: Add group_name to dispositions
ALTER TABLE dispositions ADD COLUMN IF NOT EXISTS group_name VARCHAR(255);
