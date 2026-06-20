# Simpulx

**The customer engagement platform built for sales teams.**

Multi-tenant omnichannel WhatsApp sales platform. It turns inbound leads, most arriving via
Click-to-WhatsApp (CTWA) ads into one shared WhatsApp Business number, into tracked,
qualified, **fairly-distributed** sales conversations, with SLA and conversion visibility
across teams.

Live in production at **https://app.simpulx.com**. Design docs live in
[`ai-context/`](ai-context/) (start at [19-current-state.md](ai-context/19-current-state.md));
production runbook in [DEPLOY.md](DEPLOY.md).

## What it does

- **Omnichannel inbox:** WhatsApp (Cloud API), Facebook Messenger, Instagram DMs, Viber.
  Shared inbox with role-based visibility, assignment, internal notes, WA-call tracking.
- **Channel & Integrations:** connect channels via a real wizard (WhatsApp Embedded
  Signup or Direct Cloud API, Viber), capture leads via **Web API** sources, and connect
  **ad accounts** (Meta/TikTok/Google) for spend to cost-per-lead/sale.
- **Campaigns + branches:** a campaign (a group) holds branches; a lead routes by ad
  source to the right branch, then **round-robin** to that branch's agents
  (fair-distribution engine; one contact can hold parallel conversations per campaign).
- **Lead intelligence:** rules classifier (interest hot/warm/cold), structured field
  extraction (brand/model/city/timeframe), and buy-potential scoring; smart 4h follow-up
  (not a realtime chatbot). SLA metrics (first/avg response, follow-ups, conversion).
- **Broadcasts, templates, automations, follow-up sequences, quick replies, knowledge base.**
- **Admin:** teams, roles and permissions, departments, audit logs, branding.

## Stack

| Layer | Tech |
|---|---|
| Core services | **Go**: gateway, messaging, conversation, realtime, broadcasts |
| Intelligence services | **Python / FastAPI**: lead scoring + field extraction, retrieval/RAG |
| Web dashboard | **Next.js** (App Router) + React + TypeScript |
| Mobile | Native: Kotlin (Android), Swift (iOS) [planned] |
| Data | PostgreSQL + **pgvector**, Redis, MinIO/S3 |
| Event bus | **NATS JetStream** (JSON event contracts) |
| Edge / infra | Caddy + Cloudflare on a single AWS Graviton EC2 |

## Repo layout

```
services/
  gateway/        (Go)     webhook ingest, auth, REST API, lead routing, calls
  messaging/      (Go)     normalize inbound, persist, outbound senders (WA/Viber)
  conversation/   (Go)     conversation/thread + SLA logic
  realtime/       (Go)     WebSocket hub + Redis pub/sub
  broadcasts/     (Go)     bulk template sends + delivery tracking
  ai-agent/       (Python) lead classify/score, field extraction, follow-up drafting
  knowledge/      (Python) ingest, chunk, embed to pgvector (RAG)
web/              (Next.js) dashboard
mobile/           Kotlin + Swift [planned]
libs/{go,python}/ shared libraries (config, db, broker, events, embeddings)
db/migrations/    goose SQL migrations
deploy/docker/    compose (dev builds locally; prod pulls images from ECR)
ai-context/       product + architecture docs (source of truth)
```

## Run locally (dev)

Host only needs **Docker**. Every service builds and runs in a container.

```bash
cp .env.example .env     # set ANTHROPIC_API_KEY for a real model (optional; mock works offline)
make dev                 # build + start postgres, redis, nats, minio + all services
make logs                # follow logs
make psql                # psql into the dev DB
make down                # stop
```

Without an API key the intelligence layer falls back to a deterministic embedder and a mock
model, so the stack still runs end-to-end offline. Migrations apply automatically on gateway
boot in dev (`RUN_MIGRATIONS_ON_BOOT=true`).

## Production / CI-CD

Push to `main`, GitHub Actions builds the changed service images natively on an ARM runner
and pushes `:<sha>` to **ECR**; the EC2 box just **pulls** and restarts (it never builds). DB
migrations run as a dedicated deploy step, not on boot. Rollback = run the `Deploy Simpulx`
workflow with an older `image_tag`. Details in [DEPLOY.md](DEPLOY.md).
