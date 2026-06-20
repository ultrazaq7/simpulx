-- +goose Up
-- Async export jobs: a section's "Export" queues a job; a gateway goroutine
-- generates the full CSV (all rows, not a capped page), uploads it to storage, and
-- flips the job to completed. The Downloads tab polls these rows for live status.
CREATE TABLE export_jobs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    requested_by    uuid REFERENCES users(id) ON DELETE SET NULL,
    kind            varchar(30) NOT NULL,                 -- messages | conversations | calls | activity
    date_from       date,
    date_to         date,
    status          varchar(20) NOT NULL DEFAULT 'queued', -- queued | processing | completed | failed
    row_count       integer,
    file_url        text,
    error           text,
    expires_at      timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    completed_at    timestamptz
);
CREATE INDEX idx_export_jobs_org ON export_jobs(organization_id, created_at DESC);
