-- +goose Up

-- ============================================================
-- Seed dev: satu org + agent AI + channel WA + knowledge FAQ.
-- ID tetap (deterministik) supaya mudah dipakai di smoke test.
-- ============================================================

INSERT INTO organizations (id, name, slug, plan)
VALUES ('00000000-0000-0000-0000-0000000000a1', 'Simpulx Demo', 'demo', 'pro');

INSERT INTO ai_agents (id, organization_id, name, system_prompt, mode, handoff_threshold)
VALUES (
    '00000000-0000-0000-0000-0000000000b1',
    '00000000-0000-0000-0000-0000000000a1',
    'Simpuler',
    'Kamu adalah asisten customer support Simpulx. Jawab singkat, ramah, dalam Bahasa Indonesia. Gunakan konteks pengetahuan bila tersedia. Bila tidak yakin atau pertanyaan butuh manusia, katakan akan dialihkan ke agen.',
    'auto',
    0.55
);

-- Channel WhatsApp demo. phone_number_id dipakai mencocokkan webhook.
INSERT INTO channels (id, organization_id, type, name, phone_number_id, waba_id, access_token)
VALUES (
    '00000000-0000-0000-0000-0000000000c1',
    '00000000-0000-0000-0000-0000000000a1',
    'whatsapp', 'Demo WA', '1234567890', 'demo-waba', 'DEMO_TOKEN'
);
