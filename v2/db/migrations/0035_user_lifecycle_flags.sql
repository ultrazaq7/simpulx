-- +goose Up
-- Explicit lifecycle flags for billing / activity accounting.
--
-- The three account axes are now first-class and queryable:
--   is_online   (presence; cosmetic, no routing/billing effect)
--   is_inactive + inactive_since  -> account paused (reversible)
--   is_deleted  + deleted_at      -> account removed (tombstoned, permanent)
--
-- The operational `status` (active|inactive) still gates login + lead routing,
-- and is kept in sync with is_inactive. The boolean flags + timestamps give
-- billing an accurate "when did this account stop being active" date so active
-- spans can be calculated later.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_inactive    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS inactive_since timestamptz,
  ADD COLUMN IF NOT EXISTS is_deleted     boolean NOT NULL DEFAULT false;

-- Backfill from the columns that already encode this state.
UPDATE users SET is_deleted = true WHERE deleted_at IS NOT NULL;
UPDATE users SET is_inactive = true, inactive_since = COALESCE(inactive_since, updated_at)
  WHERE status = 'inactive';

-- "Live users" hot-path predicate keys off the boolean now.
DROP INDEX IF EXISTS idx_users_active;
CREATE INDEX IF NOT EXISTS idx_users_live ON users(organization_id) WHERE is_deleted = false;

-- +goose Down
DROP INDEX IF EXISTS idx_users_live;
ALTER TABLE users
  DROP COLUMN IF EXISTS is_inactive,
  DROP COLUMN IF EXISTS inactive_since,
  DROP COLUMN IF EXISTS is_deleted;
