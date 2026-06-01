# 09 — Database Design

PostgreSQL 16 + **pgvector**. Schema lives in `db/migrations/` (`0000`–`0019`), applied
in order on first DB init. Every domain table is tenant-scoped by `organization_id`.

> Note on migrations: the team sometimes edits early files (e.g. `0001_core.sql`) directly
> rather than always appending a new migration, so new columns may live in `0001`. A
> running DB may need a manual `ALTER` to match. See [17-devops.md](17-devops.md).

## Table inventory (31 tables)

```
Core:        organizations, users, departments, agent_departments, contacts,
             conversations, messages, conversation_events, internal_notes
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
Platform:    audit_log, fcm_tokens, password_reset_tokens
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
> Gotcha: `messages` has **no** `updated_at` column. Status updates set `status` only.

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
  `idx_pwreset_hash`. Add covering indexes for the role-scoped conversation list as data
  grows (`(organization_id, assigned_agent_id, status, last_message_at)`).

## Two-axis classification (schema reflection)

Interest level (`conversations.interest_level`) and funnel stage
(`conversations.stage_id` → `stages`) are deliberately separate columns; never collapse
one into the other.
