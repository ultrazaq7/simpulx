-- +goose Up
-- Departments removed entirely (unused; routing is campaign/branch based now).
-- Drop the orphaned FK columns first, then the join table, then departments.
ALTER TABLE conversations   DROP COLUMN IF EXISTS department_id;
ALTER TABLE web_api_sources DROP COLUMN IF EXISTS auto_assign_dept_id;
DROP TABLE IF EXISTS agent_departments;
DROP TABLE IF EXISTS departments;

-- +goose Down
-- Irreversible (data is gone); recreate empty shells so the schema can roll back.
CREATE TABLE IF NOT EXISTS departments (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL,
    name            varchar(120) NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS agent_departments (
    user_id       uuid NOT NULL,
    department_id uuid NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, department_id)
);
ALTER TABLE conversations   ADD COLUMN IF NOT EXISTS department_id uuid;
ALTER TABLE web_api_sources ADD COLUMN IF NOT EXISTS auto_assign_dept_id uuid;
