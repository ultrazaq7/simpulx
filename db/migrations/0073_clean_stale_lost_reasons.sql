-- +goose Up
-- Clean up stale lost_reason and disposition_id on conversations that are no
-- longer in a lost stage.  This is a one-time data fix for the bug where
-- changing a lead's stage did not clear the old lost_reason.
UPDATE conversations
   SET lost_reason = NULL,
       disposition_id = NULL
 WHERE lost_reason IS NOT NULL
   AND stage_id IS NOT NULL
   AND NOT EXISTS (
       SELECT 1 FROM stages
        WHERE id = conversations.stage_id
          AND system_key LIKE 'lost%');

-- +goose Down
-- Cannot safely restore stale lost reasons
