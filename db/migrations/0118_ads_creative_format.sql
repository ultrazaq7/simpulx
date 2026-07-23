-- +goose Up
-- Ad creative format per campaign: 'single' = one ad per uploaded creative
-- (current behaviour), 'carousel' = ALL images become the swipeable cards of
-- ONE ad (Meta child_attachments, 2-10 cards). A campaign-level choice, not
-- per-creative: mixing both in one ad set splits budget unpredictably and
-- doubles the review surface for no benefit at this stage.
ALTER TABLE campaigns
    ADD COLUMN IF NOT EXISTS ads_creative_format varchar(12) NOT NULL DEFAULT 'single';

-- +goose StatementBegin
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaigns_ads_creative_format_check') THEN
        ALTER TABLE campaigns ADD CONSTRAINT campaigns_ads_creative_format_check
            CHECK (ads_creative_format IN ('single', 'carousel'));
    END IF;
END $$;
-- +goose StatementEnd

-- +goose Down
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_ads_creative_format_check;
ALTER TABLE campaigns DROP COLUMN IF EXISTS ads_creative_format;
