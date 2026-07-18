-- +goose Up
-- Meta Conversions API (CAPI) for Click-to-WhatsApp: send funnel outcomes
-- (Qualified Lead / Appointment / Booking / Closing) back to Meta so ad delivery
-- optimizes toward leads that actually convert. This is the growth lever for CTWA
-- customers: lower cost-per-qualified-lead, higher lead quality.
--
-- Three pieces:
--   1. Persist the CTWA click id (ctwa_clid) that Meta sends on the ad referral.
--      It is the join key CAPI needs to attribute a conversion to the click.
--   2. capi_dataset_id on the org's Meta ad account (the dataset events POST to).
--      NULL = feature dormant for that org (no events sent) -> backward compatible.
--   3. capi_events outbox + a trigger that enqueues one row per funnel-stage
--      transition, but ONLY when the conversation has a stored ctwa_clid. The
--      gateway drains this outbox and POSTs to graph.facebook.com. Using a DB
--      trigger as the hook means EVERY path that moves a conversation's stage
--      (agent drag, classifier, automation) is captured in one place instead of
--      instrumenting each call site.

ALTER TABLE conversation_attributions ADD COLUMN IF NOT EXISTS ctwa_clid text;

-- The Meta dataset (formerly "pixel") id events are posted to. Reuses the ad
-- account's existing (encrypted) access_token for auth. NULL keeps CAPI off.
ALTER TABLE ad_accounts ADD COLUMN IF NOT EXISTS capi_dataset_id text;

CREATE TABLE IF NOT EXISTS capi_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  stage_key       text NOT NULL,                       -- qualified|appointment|test_drive|booking|won
  ctwa_clid       text NOT NULL,
  status          text NOT NULL DEFAULT 'pending',     -- pending|sent|failed|skipped
  attempts        int  NOT NULL DEFAULT 0,
  last_error      text,
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- One event per (conversation, funnel stage): a lead re-entering the same stage
  -- must not double-fire a conversion. The row id doubles as Meta's event_id for
  -- Meta-side dedup across retries.
  UNIQUE (conversation_id, stage_key)
);
CREATE INDEX IF NOT EXISTS idx_capi_events_pending ON capi_events(status, created_at)
  WHERE status = 'pending';

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION enqueue_capi_event() RETURNS trigger AS $$
DECLARE
  v_key  text;
  v_clid text;
BEGIN
  -- Only on a real stage change to a non-null stage.
  IF NEW.stage_id IS NULL OR NEW.stage_id IS NOT DISTINCT FROM OLD.stage_id THEN
    RETURN NEW;
  END IF;
  SELECT system_key INTO v_key FROM stages WHERE id = NEW.stage_id;
  IF v_key IS NULL OR v_key NOT IN ('qualified','appointment','test_drive','booking','won') THEN
    RETURN NEW;
  END IF;
  -- Last-touch CTWA click for this conversation; skip if the lead never came from
  -- a click-to-WhatsApp ad (nothing to attribute back to Meta).
  SELECT ctwa_clid INTO v_clid FROM conversation_attributions
   WHERE conversation_id = NEW.id AND ctwa_clid IS NOT NULL
   ORDER BY created_at DESC LIMIT 1;
  IF v_clid IS NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO capi_events (organization_id, conversation_id, stage_key, ctwa_clid)
  VALUES (NEW.organization_id, NEW.id, v_key, v_clid)
  ON CONFLICT (conversation_id, stage_key) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

CREATE TRIGGER trg_enqueue_capi
  AFTER UPDATE OF stage_id ON conversations
  FOR EACH ROW EXECUTE FUNCTION enqueue_capi_event();

-- +goose Down
DROP TRIGGER IF EXISTS trg_enqueue_capi ON conversations;
DROP FUNCTION IF EXISTS enqueue_capi_event();
DROP TABLE IF EXISTS capi_events;
ALTER TABLE ad_accounts DROP COLUMN IF EXISTS capi_dataset_id;
ALTER TABLE conversation_attributions DROP COLUMN IF EXISTS ctwa_clid;
