-- +goose Up

-- ============================================================
-- 0064_wa_flows — WhatsApp Forms (native Meta WhatsApp Flows)
-- A "form" is authored in our builder (`definition`: screens + components),
-- compiled to Meta Flow JSON (`flow_json`), and published to a WABA
-- (`meta_flow_id`). Submissions arrive via the nfm_reply webhook and land
-- in wa_flow_responses, keyed back to the form by the flow_token we mint
-- when sending.
-- ============================================================
CREATE TABLE IF NOT EXISTS wa_flows (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    channel_id       uuid REFERENCES channels(id) ON DELETE SET NULL,
    name             varchar(160) NOT NULL,
    -- Builder model (our editable shape): {"screens":[{id,title,components:[...]}]}
    definition       jsonb        NOT NULL DEFAULT '{"screens":[]}'::jsonb,
    -- Compiled Meta Flow JSON actually published to Meta.
    flow_json        jsonb        NOT NULL DEFAULT '{}'::jsonb,
    -- Meta categories (SIGN_UP, LEAD_GENERATION, CONTACT_US, SURVEY, OTHER, ...).
    categories       jsonb        NOT NULL DEFAULT '["OTHER"]'::jsonb,
    meta_flow_id     varchar(64),                              -- Meta's flow id once created
    status           varchar(20)  NOT NULL DEFAULT 'draft',    -- draft | published | deprecated
    publish_error    text,                                     -- last publish failure (UI surfacing)
    created_by       uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at       timestamptz  NOT NULL DEFAULT now(),
    updated_at       timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_flows_org  ON wa_flows(organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_flows_meta ON wa_flows(meta_flow_id);

CREATE TABLE IF NOT EXISTS wa_flow_responses (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    flow_id          uuid REFERENCES wa_flows(id) ON DELETE SET NULL,
    meta_flow_id     varchar(64),
    flow_token       varchar(160),
    conversation_id  uuid REFERENCES conversations(id) ON DELETE SET NULL,
    contact_id       uuid REFERENCES contacts(id) ON DELETE SET NULL,
    contact_name     varchar(200),
    contact_phone    varchar(40),
    -- Collected field -> value map exactly as the customer submitted.
    response         jsonb        NOT NULL DEFAULT '{}'::jsonb,
    received_at      timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_flow_resp_org   ON wa_flow_responses(organization_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_flow_resp_flow  ON wa_flow_responses(flow_id);
CREATE INDEX IF NOT EXISTS idx_wa_flow_resp_token ON wa_flow_responses(flow_token);

-- +goose Down
DROP TABLE IF EXISTS wa_flow_responses;
DROP TABLE IF EXISTS wa_flows;
