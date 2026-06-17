-- +goose Up

-- ============================================================
-- Simpulx v2 - Agent inbox productivity: quick replies + internal notes.
-- ============================================================

CREATE TABLE quick_replies (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    shortcut        varchar(40) NOT NULL,        -- e.g. /price
    title           varchar(120) NOT NULL,
    body            text NOT NULL,
    created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (organization_id, shortcut)
);
CREATE INDEX idx_qr_org ON quick_replies(organization_id);

CREATE TABLE internal_notes (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id         uuid REFERENCES users(id) ON DELETE SET NULL,
    body            text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notes_conv ON internal_notes(conversation_id, created_at);

-- Seed a few quick replies for the demo org.
INSERT INTO quick_replies (organization_id, shortcut, title, body) VALUES
    ('00000000-0000-0000-0000-0000000000a1', '/greet', 'Greeting', 'Hi! Thanks for reaching out. How can I help you today?'),
    ('00000000-0000-0000-0000-0000000000a1', '/hours', 'Operating hours', 'We are open Mon-Fri 08:00-17:00 WIB, and Sat 09:00-14:00.'),
    ('00000000-0000-0000-0000-0000000000a1', '/testdrive', 'Test drive', 'Sure, I can arrange a test drive for you. Which day works best?'),
    ('00000000-0000-0000-0000-0000000000a1', '/address', 'Showroom address', 'Our showroom is open during business hours - feel free to drop by anytime. Would you like me to share the map link?');
