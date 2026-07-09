-- +goose Up
-- Records account/data-deletion requests submitted from the public
-- /delete-account page (Google Play data-deletion requirement). Processed by the
-- team within the stated window; unauthenticated so a signed-out user can submit.
CREATE TABLE IF NOT EXISTS account_deletion_requests (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email      varchar(320) NOT NULL,
    reason     text,
    status     varchar(20) NOT NULL DEFAULT 'pending',
    created_at timestamptz NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE IF EXISTS account_deletion_requests;
