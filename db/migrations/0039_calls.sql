-- +goose Up
-- WhatsApp Business Calling API: tracks call permission requests, VoIP call
-- lifecycle, and SDP exchange for WebRTC signaling.
CREATE TABLE IF NOT EXISTS calls (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid NOT NULL REFERENCES organizations(id),
  conversation_id         uuid NOT NULL REFERENCES conversations(id),
  channel_id              uuid NOT NULL REFERENCES channels(id),
  agent_id                uuid REFERENCES users(id),
  contact_phone           text NOT NULL,

  -- Meta call state
  external_call_id        text,
  permission_msg_id       text,
  permission_status       text NOT NULL DEFAULT 'pending',
  call_status             text NOT NULL DEFAULT 'idle',

  -- Timing
  permission_requested_at timestamptz,
  permission_granted_at   timestamptz,
  call_initiated_at       timestamptz,
  call_connected_at       timestamptz,
  call_ended_at           timestamptz,
  duration_seconds        int NOT NULL DEFAULT 0,

  -- SDP exchange (transient, cleaned after call ends)
  sdp_offer               text,
  sdp_answer              text,

  end_reason              text,
  created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_calls_conv ON calls(conversation_id);
CREATE INDEX IF NOT EXISTS idx_calls_ext  ON calls(external_call_id);
CREATE INDEX IF NOT EXISTS idx_calls_perm ON calls(permission_msg_id);
