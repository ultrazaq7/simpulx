# Simpulx v2 — AI-First Omnichannel Platform

Rewrite Simpulx ke arsitektur **AI-first**: AI agent (LLM + RAG + tool-calling)
menangani percakapan otomatis dengan handoff mulus ke agen manusia, di atas fondasi
omnichannel + CRM multi-tenant.

## Stack

| Layer            | Teknologi                                              |
|------------------|--------------------------------------------------------|
| Core services    | **Go** (gateway, messaging, conversation, realtime)    |
| AI services      | **Python / FastAPI** (ai-agent, knowledge/RAG)         |
| Web dashboard    | **Next.js** (React + TypeScript)                       |
| Mobile           | **Native** — Kotlin (Android), Swift (iOS)             |
| Datastore        | PostgreSQL + **pgvector** (RAG), Redis, MinIO/S3        |
| Event bus        | **NATS JetStream** (kontrak event JSON; gRPC menyusul) |

## Struktur

```
v2/
  proto/            kontrak event (JSON schema) + (nanti) gRPC .proto
  db/migrations/    schema SQL (dijalankan berurutan saat boot postgres)
  libs/go/          shared Go: config, log, db, broker, tenant
  libs/python/      shared Python: settings, db, embeddings, llm
  services/
    gateway/        (Go)     webhook ingest, auth, ACK cepat -> publish event
    messaging/      (Go)     normalize inbound, persist, outbound sender
    realtime/       (Go)     WebSocket hub + Redis pub/sub
    ai-agent/       (Python) orkestrasi LLM, RAG retrieve, tool-call, handoff
    knowledge/      (Python) ingest -> chunk -> embed -> pgvector
  web/              (Next.js) dashboard agen   [Fase 3]
  mobile/           Kotlin + Swift             [Fase 5]
  deploy/docker/    compose dev (semua via container — host tak perlu Go/Python)
```

## Menjalankan (dev)

Host hanya butuh **Docker**. Semua service dibuild & dijalankan dalam container.

```bash
cd v2
cp .env.example .env          # isi ANTHROPIC_API_KEY bila ingin LLM asli (opsional)
make dev                      # up: postgres, redis, nats, minio, + semua service
make logs                     # ikuti log
make smoke                    # kirim webhook WA simulasi + cek end-to-end
make down                     # stop
```

Tanpa API key, AI layer memakai **provider fallback lokal** (embedder deterministik +
LLM mock) sehingga slice tetap bisa diverifikasi end-to-end offline. Set `ANTHROPIC_API_KEY`
(dan `EMBED_PROVIDER=openai` + `OPENAI_API_KEY`) untuk mengaktifkan model asli.

## Status

Fase 0 (fondasi) + Fase 1 (vertical slice: WA inbound → AI balas ber-RAG → realtime) — lihat
roadmap di plan. Fase berikutnya: conversation/routing, dashboard, CRM, mobile, migrasi+cutover.
