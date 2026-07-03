-- 0078_contact_lead_fields — contact-level stage / interest / owner fallback.
--
-- stage_id, interest_level and assigned_agent_id normally live on a
-- conversation (a "lead instance"). Manually-created contacts often have no
-- conversation yet, so these columns give them an editable fallback. The
-- contacts list COALESCEs the latest conversation's value over these, and the
-- update paths write to the conversation when one exists, else to the contact.

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS stage_id uuid REFERENCES stages(id) ON DELETE SET NULL;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS interest_level varchar(20);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS assigned_agent_id uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS contacts_assigned_agent_idx ON contacts(assigned_agent_id) WHERE assigned_agent_id IS NOT NULL;
