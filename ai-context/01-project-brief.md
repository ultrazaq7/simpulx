# 01 — Project Brief

> Part of the Simpulx v2 `ai-context/` foundation. Read [20-handoff.md](20-handoff.md) first if you are new.

## What Simpulx is

Simpulx is a multi-tenant, AI-assisted **omnichannel WhatsApp sales platform** for
automotive dealer networks (initial customer: **OTO**, an Indonesian car-sales group).
It turns inbound WhatsApp leads — most arriving via Click-to-WhatsApp (CTWA) ads — into
tracked, qualified, fairly-distributed sales conversations, and gives managers SLA and
conversion visibility across many dealers sharing one WhatsApp Business number.

## The problem

OTO runs Meta ads across many car brands/dealers, all funneling into **one shared WABA
(WhatsApp Business Account) number**. Without tooling this creates chaos:

- Leads land in one inbox with no attribution to the campaign/dealer that paid for them.
- No fair way to split leads across the dealer's sales reps.
- No qualification or scoring — reps chase cold leads and miss hot ones.
- Customers go silent and nobody follows up.
- Management has zero visibility into response times or conversion.

## The solution (v2)

A rewrite to an **AI-first, event-driven** architecture:

1. **Attribution + fair distribution** — every inbound lead is mapped to a campaign
   (by CTWA ad source id, Web API source, or keyword) and round-robin assigned to that
   campaign's agents. One contact can hold parallel conversations across campaigns.
2. **Lead qualification & scoring** — a rules classifier (ported from the validated OTO
   lead-quality framework) tags interest level (hot/warm/cold) and a structured field
   extractor (LLM) pulls brand/model/city/purchase-timeframe — without a human touching
   the CRM.
3. **Smart auto follow-up** — NOT an AI chatbot. If a customer goes quiet for 4 hours
   and no rep has followed up, an AI-generated, human-sounding follow-up is sent.
4. **SLA monitoring** — first/avg response time, follow-up count, WA-call attempts,
   appointments, conversion.

## What it is NOT (scope guardrails)

- **Not an AI auto-replier.** Per explicit product decision, the AI does not converse
  with customers in real time. It classifies, extracts, and drafts follow-ups only.
  (The RAG+LLM auto-reply engine was built then removed — see [15-ai-engine.md](15-ai-engine.md).)
- **Not a generic CRM.** It is opinionated around the car-sales funnel.
- **Not v1.** v1 (NestJS + Flutter, live at app.simpulx.com) still runs; v2 is a
  separate, not-yet-deployed rewrite in the `v2/` directory.

## Target users

Dealer **sales agents** (handle assigned chats), **managers** (own campaigns, watch
SLA), and platform **admins/owners** (configure everything). See [04-user-personas.md](04-user-personas.md).

## Stack at a glance

| Layer | Tech |
|---|---|
| Core services | Go (gateway, messaging, conversation, realtime, broadcasts) |
| AI services | Python / FastAPI (ai-agent, knowledge/RAG) |
| Web dashboard | Next.js 14 (App Router) + React + TypeScript + MUI |
| Mobile | Native — Kotlin (Android), Swift (iOS) [planned] |
| Data | PostgreSQL + pgvector, Redis, MinIO/S3 |
| Event bus | NATS JetStream (JSON event contracts) |

## Status

Pre-deployment. Backend services run locally via Docker Compose; the Next.js dashboard
runs locally (dev or prod build). No CI/CD for v2 yet (the existing GitHub Actions
pipeline only deploys v1). See [19-current-state.md](19-current-state.md).
