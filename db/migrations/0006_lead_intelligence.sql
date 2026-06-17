-- +goose Up

-- ============================================================
-- Simpulx v2 - AI Lead Intelligence.
-- Auto-classification writes interest level + pipeline stage +
-- disposition onto conversations, driven by the AI from the chat
-- (so sales reps don't have to update CRM fields manually).
-- ============================================================

ALTER TABLE conversations
    ADD COLUMN interest_level varchar(10);   -- hot | warm | cold (AI-inferred)

-- system_key lets the classifier map to a stage/disposition deterministically,
-- independent of the human-facing name (which orgs can rename).
ALTER TABLE stages       ADD COLUMN system_key varchar(30);
ALTER TABLE dispositions ADD COLUMN system_key varchar(30);

CREATE INDEX idx_conv_interest ON conversations(organization_id, interest_level);

-- ---- Seed default car-sales pipeline for the demo org ----
INSERT INTO stages (organization_id, name, sort_order, system_key) VALUES
    ('00000000-0000-0000-0000-0000000000a1', 'New Lead',    1, 'new'),
    ('00000000-0000-0000-0000-0000000000a1', 'Contacted',   2, 'contacted'),
    ('00000000-0000-0000-0000-0000000000a1', 'Qualified',   3, 'qualified'),
    ('00000000-0000-0000-0000-0000000000a1', 'Appointment', 4, 'appointment'),
    ('00000000-0000-0000-0000-0000000000a1', 'Test Drive',  5, 'test_drive'),
    ('00000000-0000-0000-0000-0000000000a1', 'Booking',     6, 'booking');

INSERT INTO dispositions (organization_id, name, category, is_terminal, sort_order, system_key) VALUES
    ('00000000-0000-0000-0000-0000000000a1', 'Hot',   'won',      false, 1, 'hot'),
    ('00000000-0000-0000-0000-0000000000a1', 'Warm',  'follow_up',false, 2, 'warm'),
    ('00000000-0000-0000-0000-0000000000a1', 'Cold',  'lost',     false, 3, 'cold'),
    ('00000000-0000-0000-0000-0000000000a1', 'Lost',  'lost',     true,  4, 'lost');
