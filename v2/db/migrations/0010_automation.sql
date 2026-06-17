-- +goose Up

-- ============================================================
-- 0010_automation — rule-based automations + visual flow graph
-- An automation = a trigger (+ conditions) that runs either a simple
-- ordered action list (rule mode) or a node graph (flow builder).
-- ============================================================
CREATE TABLE automations (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name             varchar(160) NOT NULL,
    description      text,
    trigger_type     varchar(40)  NOT NULL DEFAULT 'new_message',
    trigger_config   jsonb        NOT NULL DEFAULT '{}'::jsonb,   -- {keywords:[], source_ids:[], idle_minutes:..}
    channel_id       uuid REFERENCES channels(id) ON DELETE SET NULL,
    actions          jsonb        NOT NULL DEFAULT '[]'::jsonb,   -- [{type, params}] simple rule mode
    flow             jsonb        NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::jsonb, -- visual builder graph
    is_active        boolean      NOT NULL DEFAULT true,
    run_count        integer      NOT NULL DEFAULT 0,
    created_by       uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at       timestamptz  NOT NULL DEFAULT now(),
    updated_at       timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX idx_automations_org ON automations(organization_id);
CREATE INDEX idx_automations_trigger ON automations(organization_id, trigger_type) WHERE is_active;

-- Demo automations so the dashboard isn't empty.
INSERT INTO automations (organization_id, name, description, trigger_type, trigger_config, actions, flow) VALUES
 ('00000000-0000-0000-0000-0000000000a1',
  'Welcome new chats', 'Greet first-time contacts and let the AI take over.',
  'new_conversation', '{}'::jsonb,
  '[{"type":"send_message","params":{"message":"Hi! Thanks for reaching out to us. How can we help today?"}}]'::jsonb,
  '{"nodes":[{"id":"trigger","type":"trigger","x":40,"y":40,"config":{}},
             {"id":"a1","type":"send_message","x":40,"y":200,"config":{"message":"Hi! Thanks for reaching out to us. How can we help today?"}}],
    "edges":[{"from":"trigger","to":"a1"}]}'::jsonb),
 ('00000000-0000-0000-0000-0000000000a1',
  'Route pricing questions', 'When a message mentions price, tag it and assign the sales queue.',
  'keyword_match', '{"keywords":["price","harga","quote","pricing"]}'::jsonb,
  '[{"type":"add_tag","params":{"tags":["pricing"]}},{"type":"assign_team","params":{"queue":"sales"}}]'::jsonb,
  '{"nodes":[{"id":"trigger","type":"trigger","x":40,"y":40,"config":{"keywords":["price","harga"]}},
             {"id":"a1","type":"add_tag","x":40,"y":200,"config":{"tags":["pricing"]}},
             {"id":"a2","type":"assign_team","x":40,"y":340,"config":{"queue":"sales"}}],
    "edges":[{"from":"trigger","to":"a1"},{"from":"a1","to":"a2"}]}'::jsonb);
