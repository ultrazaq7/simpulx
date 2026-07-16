# Next session — pick up here

## Context
Pre-launch (no active users). Budget Rp 2jt/mo. Target: 1k concurrent later.
Prod: single `t4g.medium` (2 vCPU / 4 GB) running ALL 13 containers incl. Postgres,
Redis, NATS, MinIO. Region ap-southeast-3.

## DONE (verified, don't redo)
- **Nightly DB backup**: `/opt/simpulx/backup/db-backup.sh`, cron `0 18 * * *` (01:00 WIB)
  → `s3://simpulx-media-prod/backups/`. Verified restorable (59 tables, gzip OK).
  Log: `/var/log/simpulx-backup.log`. Lifecycle expires at 30d.
- **S3 bucket** `simpulx-media-prod` (Jakarta, versioning ON, public access blocked).
  152 media files / 41.2 MB synced from MinIO. **NOT cut over yet** — MinIO still live.
- **IAM user** `simpulx-media-s3`, scoped to that bucket only. Keys: `/tmp/mk.txt`.

---

## P1 — `llm_usage` table (do this first)

**Why:** we cannot compute cost-per-conversation. $4.97 was spent 1–16 Jul but the
denominator is GONE: deleting a contact cascades away its conversations+messages.
Without this table every data cleanup destroys the ability to know if the business
is profitable. No PII goes in it, so contact deletion is irrelevant to it.

**Schema** (new migration, e.g. `0095_llm_usage.sql`):
```sql
CREATE TABLE llm_usage (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  conversation_id uuid,              -- NO FK / or ON DELETE SET NULL. NEVER CASCADE:
                                     -- the whole point is surviving contact deletion.
  feature         text NOT NULL,     -- 'extract' | 'nurture' | 'summary' | 'reply' | 'catalog'
  model           text NOT NULL,
  tokens_in       int  NOT NULL DEFAULT 0,
  tokens_out      int  NOT NULL DEFAULT 0,
  cache_read      int  NOT NULL DEFAULT 0,
  cache_write     int  NOT NULL DEFAULT 0,
  cost_usd        numeric(12,6),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_llm_usage_org_time ON llm_usage (organization_id, created_at DESC);
```

**Where to hook:** every Anthropic call funnels through `_anthropic_call()` in
`libs/python/simpulx_common/llm.py`. The Anthropic response carries `usage`
(input_tokens, output_tokens, cache_read_input_tokens,
cache_creation_input_tokens) — return it alongside the parsed object instead of
discarding it. `llm.py` has no DB pool, so DON'T write from there: bubble usage up
and INSERT in `services/ai-agent/orchestrator.py` (has `pool`) and
`services/ai-agent/main.py` (summary/reply/catalog paths).

Verify: send a test message, confirm exactly one row per LLM call with sane tokens.

---

## P2 — Two real cost leaks (proven from the Anthropic CSV, `simpulx` key only)

Spend 1–16 Jul on the `simpulx` key: **$4.67**. Models are Sonnet 4.6 (79%) +
Sonnet 5 (21%) — no Opus, model choice is fine. (An earlier Opus figure came from a
DIFFERENT api key and is not ours — ignore it.)

1. **Prompt caching currently LOSES money.**
   `cache_write $0.46` vs `cache_read $0.02` → read/write ratio **0.04**. We pay the
   +25% write premium and almost never read it back (5-min TTL expires at low
   traffic). Disable caching in `llm.py` (`cache_control` in the analyze/nurture
   system blocks) until volume justifies it; re-enable when `llm_usage` shows reads
   materially exceed writes.
2. **Output = 73% of spend** ($3.41 / $4.67). Nurture replies are too long. Capping
   output length is the single biggest lever.

NOTE: cost-per-message CANNOT be computed from the DB — deleting contacts cascaded
away the conversations/messages that generated this spend. That's exactly what P1
fixes. Do not extrapolate per-message cost until `llm_usage` has real volume
(~5k+ messages).

---

## P3 — S3 cutover (bucket + data already prepared)

**Gotcha:** media URLs in the DB are ABSOLUTE and served via Caddy:
`https://app.simpulx.com/simpulx-media/media/xxx.jpg`
`MEDIA_PUBLIC_BASE` is NOT in `/opt/simpulx/.env` — find where it's set first
(check `deploy/docker/compose*.yml`).

- Option A: repoint Caddy's `/simpulx-media*` route to S3. Old+new URLs both work,
  no DB change. But media bandwidth still flows through the EC2 box.
- Option B (recommended): `MEDIA_PUBLIC_BASE` → CloudFront, rewrite the 152 URLs in
  `messages.media_url`, then retire MinIO (frees RAM + disk IO). Only 152 rows and
  no active users — cheapest moment to do it properly.

Keep MinIO running for a week either way as a fallback.

---

## P4 — Fix the refetch pattern (free; this is what unlocks 1k concurrent)

`web/components/Shell.tsx`: on `message.persisted` it calls `refreshUnread()` →
`api.listConversations()` — a FULL list refetch, on EVERY message, for EVERY
connected client. That's O(agents x messages): one message in a 50-agent org = 50
full list queries. At 1k concurrent this melts Postgres long before WebSockets
struggle. No instance size fixes a quadratic pattern.

Replace with local patching — the groundwork already exists:
- `conversation.updated` now carries an authoritative `unread_count` (sent on read)
- per-org event `seq` + gap detection triggers a reconcile only when events are
  actually missed

---

## DO NOT
- **Don't buy Reserved Instances.** 1-year, non-cancellable, ~Rp 8–14jt, for an
  instance type nobody has load-tested. Buy AFTER a 1k load test proves the type.
- **Don't buy RDS / t4g.large yet.** No active users. Nightly backups already remove
  the catastrophic risk at ~Rp 20rb/mo vs Rp 450rb–1.34jt/mo. Buy when real load
  appears, not before.
- **Don't soft-delete contacts just to fix cost tracking** — `llm_usage` solves that
  with no PII and no query rewrites. (Soft delete is right for the CRM later, but it
  needs EVERY contact query auditing at once + a real hard-delete path for UU PDP
  erasure requests. Half-done soft delete is worse than none.)

## Pricing reality (verified via AWS Pricing API, Jakarta, @Rp 18k/USD)
| | USD/mo | IDR/mo |
|---|---|---|
| t4g.medium (current) | $30.95 | 557rb |
| t4g.large | $61.90 | 1.114rb |
| c7g.large (non-burstable) | $60.81 | 1.095rb |
| db.t4g.small | $37.23 | 670rb |
| db.t4g.medium | $74.46 | 1.340rb |

Reserved 1yr No-Upfront saves ~28%, Partial ~40% — but only buy post-load-test.

## Mobile
Build 24 IPA staged at `~/Downloads/simpulx-ipa/simpulx.ipa` (not yet uploaded).
AAB build 22 at `~/Downloads/simpulx-prod-b22.aab` (versionCode 22).
App Store screenshot compositor: `~/Downloads/simpulx-appstore/` (`./make.sh`).
Before screenshots: replace Mitsubishi branding (trademark = rejection risk),
redact phone numbers, and shoot on a real iPhone (not Android).
