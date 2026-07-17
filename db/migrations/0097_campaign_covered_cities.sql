-- +goose Up

-- ============================================================
-- 0097: campaigns.covered_cities — the campaign's SERVICE AREA
-- ============================================================
-- "Out of area" had no deterministic source. Cities only ever existed as transient
-- UI chips on catalog upload (page.tsx fans each product out per chosen city), so
-- nothing on the campaign said which cities it actually serves, and a lead from
-- Wamena could only be spotted by the AI noticing no pricelist row matched.
--
-- Deliberately NOT derived from campaign_catalog.location_name: the cities a
-- campaign SERVES are not the cities its pricelist HAS. A Jakarta dealer may well
-- serve Bekasi while only pricing the 5 Jakarta cities — deriving would read that
-- lead as out-of-area and hand it to a human for no reason. Priced-vs-serviceable
-- stay separate concerns: no rows for the lead's city => "let me check the price",
-- city outside covered_cities => a human decides.
--
-- Empty/NULL = "no service area declared" = the out-of-area handoff stays OFF for
-- that campaign (fail open — never hand off leads just because nobody filled this in).

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS covered_cities text[] NOT NULL DEFAULT '{}';

-- Backfill from each campaign's own catalog so existing campaigns keep working the
-- moment the handoff ships: without this, every campaign would start with an empty
-- service area and (once the trigger lands) nothing would change — but any campaign
-- later given cities by hand would suddenly re-classify its whole backlog. Seeding
-- from the pricelist is the best available approximation of today's behaviour, and
-- the owner can widen it in the UI.
UPDATE campaigns c
   SET covered_cities = sub.cities
  FROM (
        SELECT campaign_id, array_agg(DISTINCT location_name ORDER BY location_name) AS cities
          FROM campaign_catalog
         WHERE location_name IS NOT NULL AND btrim(location_name) <> ''
         GROUP BY campaign_id
       ) sub
 WHERE c.id = sub.campaign_id
   AND c.covered_cities = '{}';

-- +goose Down
ALTER TABLE campaigns DROP COLUMN IF EXISTS covered_cities;
