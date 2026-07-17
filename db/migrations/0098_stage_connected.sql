-- +goose Up
-- Rename the "Contacted" pipeline stage to "Connected".
-- Leads here came to US (inbound ad/WhatsApp) and replied, so "Contacted" reads
-- backwards: it sounds like we cold-called them. The stage really means the lead
-- responded and a two-way conversation exists, which is "Connected" (id: Terhubung).
-- Display name only: system_key stays 'contacted', so no application code changes.

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION seed_org_pipeline(p_org uuid) RETURNS void AS $$
BEGIN
  INSERT INTO stages (organization_id, name, sort_order, system_key)
  SELECT p_org, x.name, x.so, x.sk
    FROM (VALUES
      ('New Lead',          1, 'new'),
      ('Connected',         2, 'contacted'),
      ('Qualified',         3, 'qualified'),
      ('Appointment',       4, 'appointment'),
      ('Negotiation',       5, 'test_drive'),
      ('Purchase',          6, 'booking'),
      ('Lost Not Purchase', 0, 'lost_not_purchase'),
      ('Lost Purchase',     0, 'lost_purchase')
    ) AS x(name, so, sk)
   WHERE NOT EXISTS (
     SELECT 1 FROM stages s WHERE s.organization_id = p_org AND s.system_key = x.sk
   );

  INSERT INTO dispositions (organization_id, name, category, is_terminal, sort_order, system_key)
  SELECT p_org, d.name, d.cat, d.term, d.so, d.sk
    FROM (VALUES
      ('Hot',  'won',       false, 1, 'hot'),
      ('Warm', 'follow_up', false, 2, 'warm'),
      ('Cold', 'lost',      false, 3, 'cold'),
      ('Lost', 'lost',      true,  4, 'lost'),
      ('Spam', 'spam',      true,  5, 'spam')
    ) AS d(name, cat, term, so, sk)
   WHERE NOT EXISTS (
     SELECT 1 FROM dispositions dd WHERE dd.organization_id = p_org AND dd.system_key = d.sk
   );
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

-- Rename existing rows, guarded on the known defaults so an org's custom rename
-- is preserved.
UPDATE stages SET name = 'Connected'
 WHERE system_key = 'contacted'
   AND name IN ('Contacted', 'Dihubungi');

-- +goose Down
UPDATE stages SET name = 'Contacted'
 WHERE system_key = 'contacted'
   AND name = 'Connected';
