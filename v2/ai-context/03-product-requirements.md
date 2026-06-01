# 03 — Product Requirements

> Functional + non-functional requirements. Status legend: ✅ done · 🟡 partial ·
> ⬜ planned. Reflects the codebase as of 2026-06-01 (see [19-current-state.md](19-current-state.md)).

## MVP pillars (customer-defined)

1. Smart lead qualification & scoring
2. Smart auto follow-up (4h window, NOT an AI chatbot)
3. Call tracking (WhatsApp call redirect + attempt logging)
4. SLA monitoring

## Functional requirements

### FR-1 Inbound ingestion & attribution ✅
- Receive WhatsApp Cloud API webhooks (and Meta Messenger/Instagram).
- Resolve channel by `phone_number_id` / page id / IG account id.
- Upsert contact, attribute to a campaign (referral → keyword), persist message.
- Multi-thread: separate conversation per campaign (BR-7..BR-10).

### FR-2 Fair distribution ✅
- Round-robin assign new campaign threads to campaign agents; cursor only advances on
  real routing (BR-11, BR-12).

### FR-3 Lead qualification & scoring ✅
- Rules classifier sets interest level + funnel stage + off-topic disposition from
  genuine customer messages.
- LLM field extraction: brand, model, city, purchase_timeframe, lost_reason.
- Human override locks classification (BR-15).

### FR-4 Smart auto follow-up ✅ (gated cron) / 🟡 (content quality)
- Cron every 15 min finds eligible idle conversations (BR-18) and asks ai-agent to
  generate a human-sounding follow-up; sent as a bot outbound.

### FR-5 Inbox / conversations ✅
- List (role-scoped), open thread, paginated message history, send text/media, internal
  notes, quick replies, assign, close, toggle bot, stage/disposition/lost-reason edit.

### FR-6 Call tracking 🟡
- `POST /api/conversations/{id}/calls` logs an attempt + (optional) duration to
  `call_attempts`/`total_call_duration`. Mobile "Call Customer" WA-redirect UI ⬜.

### FR-7 SLA & analytics 🟡
- Conversation timestamps captured (`first_responsed_at`, `last_contact_message_at`,
  `last_agent_message_at`, `followup_count`, `call_attempts`). Stats + campaign analytics
  endpoints exist; full SLA dashboard (FRT, avg RT, conversion funnel) 🟡.

### FR-8 Campaigns management ✅
- CRUD campaigns, dealer name, attribution rules, agents, routing. Paginated table UI.

### FR-9 Channels ✅
- CRUD WhatsApp/Meta channels, test connection, mock mode for dev (`WA_MOCK`).

### FR-10 Templates (HSM) ✅
- CRUD message templates, submit-to-Meta (simulated in mock mode), status tracking.

### FR-11 Automation ✅
- Trigger → action rules + a visual flow builder per automation.

### FR-12 Broadcasts ✅
- Create broadcasts to recipient sets (template-based outside the 24h window).

### FR-13 Sequences / drip ✅
- Timed multi-step sequences; conversation enrollment; stop on reply.

### FR-14 Knowledge base ✅ (ingest) / 🟡 (semantic quality)
- Ingest text → chunk → embed (pgvector). Used to inform follow-ups. Local hashing
  embeddings by default (keyword-level); OpenAI embeddings optional.

### FR-15 Users, roles & permissions ✅ (config) / ⬜ (enforcement)
- Users: paginated table, invite, edit (admin can change email + reset password),
  activate/deactivate, dept/campaign membership, last login.
- Roles: permission matrix (menus + actions) stored per org. **Enforcement of the matrix
  in backend/sidebar is not yet wired** (config only).

### FR-16 Settings ✅
- General (workspace name), Branding, Notifications, Departments, AI Agent config,
  Knowledge, Audit log, plus the marketing/dev group above. Persistent settings layout.

### FR-17 Auth ✅
- Email/password login (argon2id), JWT (HS256). Forgot/reset password via SMTP (dev:
  reset link logged when SMTP unset). `last_login_at` tracked.

### FR-18 Audit log ✅
- Mutating admin actions recorded (`audit_log`) with actor, action, entity, detail.

## Non-functional requirements

- **NFR-1 Multi-tenant isolation** — enforced at query layer by `organization_id` (BR-1).
- **NFR-2 Fast webhook ACK** — gateway must ACK Meta quickly; heavy work is async via
  NATS (ingest only publishes an event).
- **NFR-3 Horizontal scale** — realtime fan-out uses Redis pub/sub so any number of
  realtime instances broadcast to their local WebSocket clients.
- **NFR-4 At-least-once events** — NATS JetStream durable consumers; handlers idempotent
  where it matters (e.g. sequence enrollment `ON CONFLICT DO NOTHING`).
- **NFR-5 Security** — argon2id passwords, JWT, role-based visibility + IDOR guards,
  per-tenant scoping, reset tokens hashed + single-use.
- **NFR-6 Dev ergonomics** — everything runs in Docker; host needs no Go/Python.
- **NFR-7 Go ≥ 1.22** — required for `net/http` method routing (see [10-backend-architecture.md](10-backend-architecture.md)).
