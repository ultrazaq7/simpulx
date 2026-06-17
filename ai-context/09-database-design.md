# 09 — Database Design

- **Schema Setup:** Database runs on `pgvector/pgvector:pg16` to support AI embeddings and standard relational data.
- **Migrations:** Automated using embedded `github.com/pressly/goose/v3` on gateway startup. Migration scripts are stored as standard `.sql` files in `db/migrations/` and packaged using `go:embed`.
- **Connections:** Services connect via PostgreSQL pool (`github.com/jackc/pgx/v5`).

> Note on migrations: the team sometimes edits early files (e.g. `0001_core.sql`) directly
> rather than always appending a new migration, so new columns may live in `0001`. A
> running DB may need a manual `ALTER` to match. See [17-devops.md](17-devops.md).

## Table inventory (31 tables)

```
Core:        organizations, users, departments, agent_departments, contacts,
             conversations, messages, conversation_events, internal_notes,
             outbox_events, conversation_attributions
Pipeline:    stages, dispositions
Campaigns:   campaigns, campaign_agents
Channels:    channels
AI:          ai_agents, ai_tools, ai_runs, knowledge_sources, knowledge_chunks
Templates:   message_templates
Automation:  automations
Broadcasts:  broadcasts, broadcast_recipients
Sequences:   sequences, sequence_steps, sequence_enrollments
Quick:       quick_replies
Integrations:web_api_sources
Platform:    audit_log, fcm_tokens, password_reset_tokens, user_activity_events
```

## Key tables

### organizations
`id, name, slug, plan, settings jsonb, created_at, updated_at`.
`settings` holds `branding`, `notifications`, and `role_permissions` (the role matrix +
custom role labels). Merge with `||`, never clobber.

### users
`id, organization_id, email, password_hash (argon2id), full_name, role
(owner|admin|manager|agent + custom), status, is_online, last_seen_at, last_login_at,
created_at, updated_at`. `UNIQUE (organization_id, email)`. `last_login_at` set on login.

**Account state = 3 independent axes** (see [19-current-state](19-current-state.md) for the rationale):
- **Presence** — `is_online` (+ `last_seen_at`). **Drives agent-performance metrics** (availability /
  online time); does NOT affect lead routing or billing charges. Set true on login, toggled via
  `PATCH /api/users/me/presence` (self, ungated). Transitions are logged to `user_activity_events`
  (below), which is what online-time/availability metrics are computed from.
- **Active/Inactive** — operational gate `status` (`active|inactive`) mirrored into billing flags
  `is_inactive` + `inactive_since`. `status='active'` is the ONLY thing that gates login + lead
  distribution. Reversible (Activate/Deactivate).
- **Deleted** — `is_deleted` + `deleted_at`. Soft delete (tombstone): the row is kept so history/
  attribution survives; account is forced inactive, presence dropped, email suffixed
  (`<email>+deleted-<id>`) to free it for reuse. Hidden from all user lists, routing, and login.

`is_inactive`/`is_deleted` (booleans + timestamps) exist so billing can compute accurate active
spans. Migrations `0034_user_soft_delete`, `0035_user_lifecycle_flags`. Live-user predicate:
`idx_users_live ON users(organization_id) WHERE is_deleted = false`.

### user_activity_events
Append-only log of account state transitions: `id, organization_id, user_id, kind
('presence'|'lifecycle'), event (presence: online|offline; lifecycle: active|inactive|deleted),
actor_id, detail jsonb, at`. One row per **real** change (no-op repeats are skipped at write time).
Source of truth for agent-performance presence metrics (online time / availability) and accurate
multi-cycle billing spans, neither of which the scalar `is_online`/`is_inactive`/`is_deleted`
columns can provide. Written from login, the presence endpoint, and Activate/Deactivate + delete.
Indexes: `(user_id, at)`, `(organization_id, at)`. Migration `0036_user_activity_events`.

### contacts
Unique per `(organization_id, phone)`; Meta contacts keyed by `external_ids.psid`.

### conversations (the hub)
One per **campaign per contact** (multi-thread). Notable columns:
- routing: `campaign_id`, `assigned_agent_id`, `department_id`, `channel_id`
- funnel/score: `stage_id`, `disposition_id`, `interest_level`, `ai_stage`
- AI: `is_bot_active`, `ai_agent_id`, `ai_confidence`, `ai_reason`, `ai_analyzed_at`,
  `classification_locked`
- extracted: `car_brand`, `car_model`, `city`, `purchase_timeframe`, `lost_reason`
- SLA: `first_responsed_at`, `last_contact_message_at`, `last_agent_message_at`,
  `last_message_at`, `followup_count`, `unread_count`
- calls: `call_attempts`, `total_call_duration`
- WA window: `window_expires_at`, `hsm_sent_at`, `hsm_count`
- lifecycle: `status`, `closed_at`, `closed_reason`, `handoff_at`, `handoff_reason`,
  `auto_close_at`

### messages
`organization_id, conversation_id, direction (inbound|outbound), sender_type
(contact|agent|bot|system), sender_id, type (text|image|audio|video|document|template),
body, media_url, external_id, status (sent|delivered|read), genuine, created_at`.
`UNIQUE(organization_id, external_id)` enforces idempotency.
> Gotcha: `messages` has **no** `updated_at` column. Status updates set `status` only.

### outbox_events
`id, organization_id, topic, payload, status, created_at, published_at`.
Used by `messaging` service for Transactional Outbox pattern to guarantee NATS delivery without dual-write races.

### conversation_attributions
`id, organization_id, conversation_id, campaign_id, referral_source, created_at`.
Tracks multi-touch click events (CTWA ad openers) across conversations permanently.

### stages / dispositions
Per-org, `system_key` lets the classifier map deterministically. Seeded funnel:
`new, contacted, qualified, appointment, test_drive, spk, delivered`. Dispositions:
`hot_deal, follow_up, not_interested, off_topic, no_response`.

### campaigns / campaign_agents
`campaigns(id, organization_id, name, dealer_name, status, routing_strategy,
ad_source_ids text[], keywords text[], rr_cursor int, lead_count int, ...)`.
`campaign_agents(campaign_id, user_id)` is the agent membership + the only user↔campaign
link (campaigns have no owner column). `rr_cursor` drives round-robin (see [14](14-fair-distribution-engine.md)).

### ai_runs
Trace of each AI invocation: `input_text, retrieved_chunk_ids, output_text, decision,
confidence, model, latency_ms`. `conversation_id` FK is `ON DELETE SET NULL`.

### knowledge_sources / knowledge_chunks
`knowledge_chunks(organization_id, source_id, chunk_index, content, embedding vector,
token_count)`. Embedding dim = `EMBED_DIM` (1536). pgvector cosine search.

### sequences / sequence_steps / sequence_enrollments
Timed follow-up sequences. `sequence_enrollments UNIQUE (sequence_id, conversation_id)`
makes enrollment idempotent; worker sends due steps and stops on reply.

### password_reset_tokens (0019)
`user_id, token_hash (sha256), expires_at (1h), used_at`. Single-use; only the hash is
stored.

## Referential integrity highlights

- Most child tables `ON DELETE CASCADE` from `organizations` and from
  `conversations`/`contacts`.
- `ai_runs.conversation_id` → `ON DELETE SET NULL` (keep the trace if a conversation is
  removed).

## Indexing notes

- `idx_users_org`, `idx_departments_org`, `idx_conv_interest`, `idx_chunks_org`,
  `idx_chunks_embedding` (ivfflat/pgvector), `idx_seq_enroll_due(status, next_run_at)`,
  `idx_pwreset_hash`.
- `idx_conv_active_contact_campaign` and `idx_conv_active_contact_no_campaign`: Partial unique constraints ensuring a contact can only have ONE active thread per campaign (or no-campaign) to prevent ghost cursors.

### Missing indexes (audit 2026-06-03)

> These do NOT exist yet and WILL cause performance issues at scale.

- **`outbox_events(status, created_at)`** — outbox relay polls `WHERE status='pending'
  ORDER BY created_at LIMIT 100` every 500ms. Without this, it's a sequential scan.
- **`conversations(organization_id, contact_id, status, last_message_at)`** — every
  inbound message queries this in `getOrCreateConversation`.
- **`conversations(organization_id, assigned_agent_id, status, last_message_at)`** —
  the role-scoped inbox list. Was documented as a future TODO; still not created.

## Missing CHECK constraints (audit 2026-06-03)

> No enum-like column has a CHECK constraint. Any typo or bug writes invalid values silently.

- `conversations.status` → should be `CHECK (status IN ('open','closed'))`
- `conversations.interest_level` → `CHECK (interest_level IN ('hot','warm','cold'))`
- `messages.direction` → `CHECK (direction IN ('inbound','outbound'))`
- `messages.sender_type` → `CHECK (sender_type IN ('contact','agent','bot','system'))`
- `messages.status` → `CHECK (status IN ('sent','delivered','read','failed'))`
- `users.role` → `CHECK (role IN ('owner','admin','manager','agent'))`
- `outbox_events.status` → `CHECK (status IN ('pending','published'))`

## Planned schema additions (roadmap 2026-06-03)

### campaigns.business_type (migration TBD)
New column `business_type varchar(40)` on `campaigns`. Values:
`financial_services`, `healthcare`, `real_estate`,
`automotive_new`, `automotive_used`, `automotive_refinance`.
Default: `automotive_new` (current-only vertical). This drives which detail fields
are relevant per conversation (see `conversations.custom_fields` below).

### conversations.custom_fields (migration TBD)
New column `custom_fields jsonb` on `conversations`. Replaces the current hardcoded
`car_brand`, `car_model`, `city`, `purchase_timeframe` with a vertical-aware schema:

| Vertical | Fields |
|---|---|
| `automotive_*` | `brand`, `model`, `variant`, `city`, `purchase_timeframe` |
| `real_estate` | `property_type`, `location`, `budget_range`, `bedrooms` |
| `financial_services` | `product_type`, `nominal`, `tenor_months` |
| `healthcare` | `service_type`, `hospital_location`, `preferred_date` |

Existing `car_brand`/`car_model`/`city`/`purchase_timeframe` columns kept for backward
compat but new writes go into `custom_fields` jsonb.

### system_logs (migration 0028)
```
id, organization_id, category ('message'|'conversation'|'user_activity'|'system'|'call'),
action (e.g. 'message.sent', 'user.login', 'conversation.closed'),
actor_id, actor_name, target_id, target_type, metadata jsonb, created_at.
```
Indexes: `(organization_id, category, created_at DESC)`, `(organization_id, actor_id)`.

### export_jobs (migration 0028)
```
id, organization_id, requested_by (FK users), type ('messages'|'conversations'|
'user_activity'|'system_logs'|'call_logs'), filters jsonb, status ('queued'|'processing'|
'completed'|'failed'), progress (0-100), total_rows, file_url, file_size, error,
created_at, completed_at.
```
Index: `(organization_id, created_at DESC)`.

### call_logs (migration 0028)
```
id, organization_id, conversation_id, contact_id, agent_id,
call_type ('api'|'manual'), direction ('outbound'|'inbound'),
duration_sec, started_at, ended_at, status ('completed'|'missed'|'rejected'),
notes text, created_at.
```
`call_type` distinguishes WA Cloud API calls (`api`) from agent-initiated deeplink/manual
calls (`manual`). Index: `(organization_id, agent_id, created_at DESC)`.

Message log export format aligns with data-train CSV columns:
`Direction, Call Duration, Message Type, Read/Sent Status, Source URL, Source ID,
Source Type, Contact Phone, Agent Name, Agent Email, Created At`.

Conversation log export includes deep metrics per conversation:
`1st Response Time, Avg Response Time, Total Messages, Follow-up Count, Call Attempts,
Total Call Duration, Interest Level, Stage, Campaign, Status`.

## Two-axis classification (schema reflection)

Interest level (`conversations.interest_level`) and funnel stage
(`conversations.stage_id` → `stages`) are deliberately separate columns; never collapse
one into the other.
