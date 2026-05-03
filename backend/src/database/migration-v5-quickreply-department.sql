-- Migration V5: Add department_id to quick_replies
ALTER TABLE quick_replies ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;
