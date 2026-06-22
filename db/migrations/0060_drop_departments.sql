-- Departments removed entirely (unused; routing is campaign/branch based now).
-- Drop the orphaned FK columns first, then the join table, then departments.
ALTER TABLE conversations   DROP COLUMN IF EXISTS department_id;
ALTER TABLE web_api_sources DROP COLUMN IF EXISTS auto_assign_dept_id;
DROP TABLE IF EXISTS agent_departments;
DROP TABLE IF EXISTS departments;
