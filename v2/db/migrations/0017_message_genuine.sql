-- ============================================================
-- 0017_message_genuine — mark non-genuine inbound messages so the lead
-- classifier ignores them. CTWA ad opener (referral pre-fill) and Web API
-- lead-capture messages are auto/template text, not genuinely typed by the
-- customer, so classifying on them biases every ad lead as "interested".
-- ============================================================
ALTER TABLE messages ADD COLUMN IF NOT EXISTS genuine boolean NOT NULL DEFAULT true;
