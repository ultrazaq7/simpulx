-- +goose Up
CREATE TABLE conversation_attributions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
    referral_source varchar(255),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_conv_attributions ON conversation_attributions(conversation_id, created_at);

-- +goose Down
DROP TABLE IF EXISTS conversation_attributions;
