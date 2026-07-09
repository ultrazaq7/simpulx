-- +goose Up
-- Use the explicit English canonical names for the two terminal lost stages
-- ("Lost Not Purchase" / "Lost Purchase") so they match the i18n source keys
-- (stages.lost_not_purchase / stages.lost_purchase). Supersedes 0087's shorter
-- "Lost" / "Lost (Bought Elsewhere)".

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION seed_org_pipeline(p_org uuid) RETURNS void AS $$
BEGIN
  INSERT INTO stages (organization_id, name, sort_order, system_key)
  SELECT p_org, x.name, x.so, x.sk
    FROM (VALUES
      ('New Lead',          1, 'new'),
      ('Contacted',         2, 'contacted'),
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

-- Normalize existing lost-stage names (guarded on the known defaults so a custom
-- rename is preserved).
UPDATE stages SET name = 'Lost Not Purchase'
 WHERE system_key = 'lost_not_purchase'
   AND name IN ('Lost', 'Kalah', 'Batal Tidak Pembelian', 'Lost Not Purchase');
UPDATE stages SET name = 'Lost Purchase'
 WHERE system_key = 'lost_purchase'
   AND name IN ('Lost (Bought Elsewhere)', 'Kalah Beli di Tempat Lain', 'Batal Pembelian', 'Lost Purchase');

-- +goose Down
SELECT 1;
