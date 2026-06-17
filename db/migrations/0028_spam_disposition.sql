-- +goose Up
-- Lost Analysis & Junk Detection (FR-34 / BR-44): add a 'spam' disposition so
-- junk/spam/off-topic leads can be bucketed SEPARATELY from genuine 'lost' leads
-- (spam is excluded from conversion math). Added for every org that lacks it.
INSERT INTO dispositions (organization_id, name, category, is_terminal, sort_order, system_key)
SELECT o.id, 'Spam', 'spam', true, 5, 'spam'
  FROM organizations o
 WHERE NOT EXISTS (
   SELECT 1 FROM dispositions d WHERE d.organization_id = o.id AND d.system_key = 'spam'
 );

-- +goose Down
DELETE FROM dispositions WHERE system_key = 'spam';
