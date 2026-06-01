# 18 — Roadmap

Status as of 2026-06-01. Sequenced by dependency and customer priority.

## Now (MVP completion)

1. **Enforce the role permission matrix.** Matrix is stored (`/api/role-permissions`) but
   not enforced. Gate sidebar menus + API actions by the caller's role permissions.
   (Security-relevant — see [16](16-security.md).)
2. **SLA dashboard.** Timestamps are captured; build the metrics surface: first response
   time, avg response time, leads touched, WA-button clicks, follow-up count, appointments
   created, conversion (Booking/Purchased). (MVP pillar 4.)
3. **Reconcile classifier stages → action funnel.** DB seeds the action funnel
   (new→…→delivered); the rules classifier still emits intent-based stage keys. Map intent
   → funnel so stage writes are consistent (BR-14).
4. **Follow-up content quality.** Feed distilled KB facts into the follow-up prompt;
   finish the `distill_kb.py --ingest` phase.

## Next (call tracking + mobile)

5. **Call tracking (mobile).** Native "Call Customer" shortcut in the chat screen that
   deep-links to the WhatsApp voice call for the contact, logging an attempt
   (`POST /api/conversations/{id}/calls`). Android (Kotlin) + iOS (Swift). Duration for WA
   calls is not capturable from outside WhatsApp — log attempts first.
6. **Mobile inbox** (native) with FCM push (tokens already captured via
   `/api/users/fcm-token`).
7. **Server-side pagination** for People/Campaigns/Conversations as row counts grow
   (client pagination is fine for now).

## Then (production readiness)

8. **v2 deploy pipeline.** Build CI/CD for the Go services + Next.js web + Python AI
   services to the VPS (separate from the v1 pipeline). Containerize web; wire Nginx
   routes; health checks. Commit `v2/` to git first (excluding scratch/PII).
9. **Security hardening:** realtime WS JWT auth + origin restriction, rate limiting on
   `/auth/*` and `/v1/leads`, Meta webhook signature verification, prod CORS lockdown,
   secrets store.
10. **Semantic embeddings:** switch `EMBED_PROVIDER` to OpenAI (or Voyage) for real RAG;
    re-embed the KB.
11. **Migration discipline:** stop editing `0001_core.sql`; append forward-only
    migrations + a runner that applies pending migrations to existing DBs.

## Later (scale + intelligence)

12. **Distribution upgrades:** skip-offline-agents, load-weighted assignment
    (`open_chats`), shift/availability, auto-rebalance on agent offline.
13. **Fine-tuning / few-shot** from `ai_runs` + distilled data for sharper classification.
14. **Billing & credits** at the campaign level (BR-5) — usage metering, dealer invoicing.
15. **gRPC** between services (event contracts currently JSON over NATS; README notes gRPC
    "menyusul").
16. **Analytics depth:** cohort/funnel analytics, per-dealer scorecards, export scheduling.

## Explicitly out of scope (per product decision)

- AI auto-reply / chatbot conversing with customers (BR-17). The AI classifies, extracts,
  and drafts follow-ups only.
