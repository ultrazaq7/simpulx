-- +goose Up
-- New orgs previously got NO pipeline (stages/dispositions only ever existed on
-- the demo org + migration backfills), so a freshly created org had an empty
-- pipeline and mark-as-lost had nothing to resolve. This adds ONE reusable
-- seeder that org creation calls, and localizes the default pipeline stage names
-- to Indonesian.
--
-- system_key is the stable identifier the classifier/orchestrator map to and is
-- never translated. Disposition NAMES stay English on purpose: the lost/spam
-- flow resolves them by name ("lost"/"spam"), so renaming would break it.

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION seed_org_pipeline(p_org uuid) RETURNS void AS $$
BEGIN
  -- Pipeline stages (Indonesian). Idempotent per system_key.
  INSERT INTO stages (organization_id, name, sort_order, system_key)
  SELECT p_org, x.name, x.so, x.sk
    FROM (VALUES
      ('Prospek Baru',              1, 'new'),
      ('Dihubungi',                 2, 'contacted'),
      ('Memenuhi Syarat',           3, 'qualified'),
      ('Janji Temu',                4, 'appointment'),
      ('Negosiasi',                 5, 'test_drive'),
      ('Pembelian',                 6, 'booking'),
      ('Kalah',                     0, 'lost_not_purchase'),
      ('Kalah Beli di Tempat Lain', 0, 'lost_purchase')
    ) AS x(name, so, sk)
   WHERE NOT EXISTS (
     SELECT 1 FROM stages s WHERE s.organization_id = p_org AND s.system_key = x.sk
   );

  -- Outcome dispositions (names kept English for the name-based lookup).
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

-- Localize the demo org's existing English stage names (guarded so a custom
-- rename is never overwritten).
UPDATE stages SET name = 'Prospek Baru'              WHERE system_key = 'new'               AND name = 'New Lead';
UPDATE stages SET name = 'Dihubungi'                 WHERE system_key = 'contacted'         AND name = 'Contacted';
UPDATE stages SET name = 'Memenuhi Syarat'           WHERE system_key = 'qualified'         AND name = 'Qualified';
UPDATE stages SET name = 'Janji Temu'                WHERE system_key = 'appointment'       AND name = 'Appointment';
UPDATE stages SET name = 'Negosiasi'                 WHERE system_key = 'test_drive'        AND name = 'Negotiation';
UPDATE stages SET name = 'Pembelian'                 WHERE system_key = 'booking'           AND name = 'Purchase';
UPDATE stages SET name = 'Kalah'                     WHERE system_key = 'lost_not_purchase' AND name = 'Lost Not Purchase';
UPDATE stages SET name = 'Kalah Beli di Tempat Lain' WHERE system_key = 'lost_purchase'     AND name = 'Lost Purchase';

-- Backfill any existing org that is missing the pipeline (idempotent; the
-- function is invoked once per org row).
SELECT seed_org_pipeline(id) FROM organizations;

-- +goose Down
UPDATE stages SET name = 'New Lead'          WHERE system_key = 'new'               AND name = 'Prospek Baru';
UPDATE stages SET name = 'Contacted'         WHERE system_key = 'contacted'         AND name = 'Dihubungi';
UPDATE stages SET name = 'Qualified'         WHERE system_key = 'qualified'         AND name = 'Memenuhi Syarat';
UPDATE stages SET name = 'Appointment'       WHERE system_key = 'appointment'       AND name = 'Janji Temu';
UPDATE stages SET name = 'Negotiation'       WHERE system_key = 'test_drive'        AND name = 'Negosiasi';
UPDATE stages SET name = 'Purchase'          WHERE system_key = 'booking'           AND name = 'Pembelian';
UPDATE stages SET name = 'Lost Not Purchase' WHERE system_key = 'lost_not_purchase' AND name = 'Kalah';
UPDATE stages SET name = 'Lost Purchase'     WHERE system_key = 'lost_purchase'     AND name = 'Kalah Beli di Tempat Lain';
DROP FUNCTION IF EXISTS seed_org_pipeline(uuid);
