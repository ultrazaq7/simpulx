-- +goose Up
-- Make English the canonical source language for the default pipeline stage
-- names, so the UI can localize them per language via i18n keys (stages.<system_key>)
-- while a dealer's custom rename shows as-is. This supersedes 0086's Indonesian
-- rename: migrations run in order, so 0086 (Indonesian) then 0087 (English) ends
-- deterministically in English regardless of prior state.

-- Reusable seeder now uses the English canonical names.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION seed_org_pipeline(p_org uuid) RETURNS void AS $$
BEGIN
  INSERT INTO stages (organization_id, name, sort_order, system_key)
  SELECT p_org, x.name, x.so, x.sk
    FROM (VALUES
      ('New Lead',              1, 'new'),
      ('Contacted',             2, 'contacted'),
      ('Qualified',             3, 'qualified'),
      ('Appointment',           4, 'appointment'),
      ('Negotiation',           5, 'test_drive'),
      ('Purchase',              6, 'booking'),
      ('Lost',                  0, 'lost_not_purchase'),
      ('Lost (Bought Elsewhere)', 0, 'lost_purchase')
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

-- Normalize existing system-stage names to the English canonical. Guarded on the
-- set of known default names (original English + 0086 Indonesian) so a dealer's
-- genuine custom rename is preserved. DB name must match the en.json value for the
-- "pristine default" check the UI uses to decide whether to localize.
UPDATE stages SET name = 'New Lead'                WHERE system_key = 'new'               AND name IN ('New Lead','Prospek Baru');
UPDATE stages SET name = 'Contacted'               WHERE system_key = 'contacted'         AND name IN ('Contacted','Dihubungi');
UPDATE stages SET name = 'Qualified'               WHERE system_key = 'qualified'         AND name IN ('Qualified','Memenuhi Syarat');
UPDATE stages SET name = 'Appointment'             WHERE system_key = 'appointment'       AND name IN ('Appointment','Janji Temu');
UPDATE stages SET name = 'Negotiation'             WHERE system_key = 'test_drive'        AND name IN ('Negotiation','Test Drive','Negosiasi');
UPDATE stages SET name = 'Purchase'                WHERE system_key = 'booking'           AND name IN ('Purchase','Booking','Pembelian');
UPDATE stages SET name = 'Lost'                    WHERE system_key = 'lost_not_purchase' AND name IN ('Lost','Lost Not Purchase','Kalah');
UPDATE stages SET name = 'Lost (Bought Elsewhere)' WHERE system_key = 'lost_purchase'     AND name IN ('Lost Purchase','Kalah Beli di Tempat Lain');

-- +goose Down
-- No-op: English canonical names are the intended source of truth.
SELECT 1;
