-- ============================================================
-- Simpulx v2 — Fase 4: Broadcasts (campaign pesan massal).
-- ============================================================

CREATE TABLE broadcasts (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name             varchar(160) NOT NULL,
    body             text NOT NULL,
    channel_id       uuid REFERENCES channels(id) ON DELETE SET NULL,
    audience         varchar(40) NOT NULL DEFAULT 'all',     -- all|... (filter menyusul)
    status           varchar(20) NOT NULL DEFAULT 'draft',   -- draft|queued|sending|completed|failed
    total_recipients integer NOT NULL DEFAULT 0,
    sent_count       integer NOT NULL DEFAULT 0,
    failed_count     integer NOT NULL DEFAULT 0,
    created_by       uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    started_at       timestamptz,
    completed_at     timestamptz
);
CREATE INDEX idx_broadcasts_org ON broadcasts(organization_id, created_at DESC);

CREATE TABLE broadcast_recipients (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    broadcast_id    uuid NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    contact_id      uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    phone           varchar(40),
    status          varchar(20) NOT NULL DEFAULT 'pending',  -- pending|sent|failed
    error           text,
    sent_at         timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_bcast_recip_broadcast ON broadcast_recipients(broadcast_id, status);
