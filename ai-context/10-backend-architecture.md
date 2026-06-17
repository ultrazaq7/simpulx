# 10 — Backend Architecture

Event-driven microservices. Go for the hot path, Python/FastAPI for AI. Communication is
async over **NATS JetStream** (JSON event contracts), with HTTP for synchronous
dashboard APIs and internal service calls.

## Services

| Service | Lang | Port | Responsibility |
|---|---|---|---|
| **gateway** | Go | 8080 | Webhook ingest (fast ACK), all dashboard REST APIs, auth/JWT, follow-up + notification crons, uploads (S3) |
| **messaging** | Go | — | Consume `message.received` → normalize, attribute, persist, round-robin assign; send outbound to WhatsApp; status updates |
| **conversation** | Go | 8083 | Conversation lifecycle (assign/close), drip/sequence worker |
| **realtime** | Go | 8082 | WebSocket hub; NATS → Redis pub/sub fan-out to dashboards |
| **broadcasts** | Go | — | Broadcast send orchestration |
| **ai-agent** | Python/FastAPI | 8000 | Classify lead, extract fields, generate follow-ups (no auto-reply) |
| **knowledge** | Python/FastAPI | 8001 | Ingest → chunk → embed → pgvector |

Infra: PostgreSQL (`:5442`), Redis (`:6390`), NATS (`:4232`), MinIO (`:9010/9011`).

## Request/event flow (inbound)

```
Meta → gateway POST /webhook/whatsapp
  gateway: validate, fast 200, publish events.message.received
NATS → messaging: attribute + persist + assign, publish events.message.persisted
NATS → ai-agent: classify + extract (no reply)
NATS → realtime: forward to Redis → WebSocket fan-out
```
Outbound: dashboard `POST /api/conversations/{id}/messages` → gateway publishes
`events.message.outbound` → messaging sends to WA (mock in dev) + persists + status.

## Event contracts (`libs/go/events`)

Subjects (stream `events.>`):
```
events.message.received           (ingest → messaging)
events.message.persisted          (messaging → ai-agent, realtime)
events.message.outbound           (gateway/ai-agent → messaging)
events.message.status.updated     (gateway → messaging)
events.conversation.assigned      (→ realtime)
events.conversation.closed        (→ realtime)
events.conversation.handoff       (→ realtime)
events.notification.alert         (gateway cron → realtime/push)
```
Envelope: `{ org_id, data }`. Consumers use **durable** JetStream consumers (queue
groups) for at-least-once delivery; handlers return false to NAK + redeliver.

## gateway internals

- `main.go` wires the `net/http` mux. **Routes use Go 1.22 method patterns**
  (`"POST /auth/login"`, `"GET /api/conversations/{id}/messages"`).
- **CRITICAL:** `go.mod` must declare **`go 1.22`+**. Under `go 1.21` semantics every
  method-prefixed route is treated as a literal path and **all `/api` + `/auth` routes
  404** while `/healthz` works. (This bit us once — see [16-security.md](16-security.md)/handoff.)
- Auth: argon2id (`auth.go`), JWT HS256 with org/role/name claims, `requireAuth`
  middleware. `last_login_at` stamped on login.
- Crons: **moved to messaging** (not gateway). See messaging internals below.
- Files: `api.go` (conversations, stages, stats, knowledge proxy, notes, contacts,
  uploads), `users.go`, `roles.go`, `campaigns.go`, `channels.go`, `templates.go`,
  `automation`, `sequences.go`, `organization.go`, `webhook`/`whatsapp.go`,
  `password_reset.go`, `mail.go`, `export.go`, `web_api.go`.

## realtime internals (`main.go`)

- **WS JWT auth implemented (2026-06-03).** The `/ws` endpoint now parses JWT from
  `?token=<jwt>` and derives orgID from claims. In dev mode (when `JWT_SECRET` equals
  the default `dev_change_me_in_prod`), the legacy `?org=` fallback is still accepted.
  In production with a real secret, `?org=` is rejected with 401.
  `CheckOrigin` still allows all — restrict to known origins in prod (P2).

## messaging internals (`store.go`, `main.go`)

- `resolveChannel`, `upsertContact`, `getOrCreateConversation` (latest open),
  `getOrCreateThread` (per-campaign multi-thread with untagged-thread adoption),
  `resolveCampaignByReferral`, `resolveCampaignByKeyword`, `routeToCampaign`
  (round-robin; cursor only advances on real route), `insertInbound`/`insertOutbound`,
  `enrollSequences`, `updateMessageStatus`.
- Crons: `runFollowUpCron` (15m, smart follow-up), `runAggressiveNotifications` (5m,
  unreplied-lead alerts). Both run in messaging, not gateway.
- Inbound order: resolve campaign FIRST, then pick/open the right conversation (so
  cross-campaign messages don't bleed — BR-8).

## ai-agent internals (`orchestrator.py`)

- `handle_inbound`: `classify_and_update` (rules) + LLM extraction. **No reply path.**
- `handle_followup`: load history → `llm.generate` sales-style → publish outbound.
- `classify` (rules, `classifier.py`), `retrieve` (RAG, `rag.py`), `llm.generate`
  (`libs/python/simpulx_common/llm.py`, anthropic|mock). See [15-ai-engine.md](15-ai-engine.md).

## Shared libs

- `libs/go/`: `config` (env), `log`, `db` (pgxpool), `broker` (NATS), `events`, `tenant`.
- `libs/python/simpulx_common/`: `settings`, `db`, `embeddings`, `llm`, `broker`.

## Scaling & reliability

- Stateless Go services scale horizontally; realtime uses Redis pub/sub so every instance
  reaches its own WS clients (NFR-3).
- JetStream durability + idempotent handlers give at-least-once safety (NFR-4).
- Postgres is the system of record; NATS is transport, Redis is cache/pub-sub.
