-- +goose Up

-- ============================================================
-- 0012_audit — workspace audit log (who did what, when).
-- ============================================================
CREATE TABLE audit_log (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    actor_id         uuid REFERENCES users(id) ON DELETE SET NULL,
    actor_name       varchar(255),
    action           varchar(60)  NOT NULL,   -- created|updated|deleted|submitted|tested
    entity_type      varchar(40)  NOT NULL,   -- channel|template|user|automation|broadcast
    entity_id        varchar(80),
    detail           jsonb        NOT NULL DEFAULT '{}'::jsonb,
    created_at       timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_org ON audit_log(organization_id, created_at DESC);
