# 19 — Current State

Snapshot as of **2026-06-01**. This is the honest "what actually works right now" doc.

## Environment

- Backend: all services running locally via Docker Compose (`simpulx-v2-*`), healthy.
- Web: Next.js, running locally. Production build verified (29 routes compile; ~19ms/page
  served). Dev mode also works (slower first-hit compile).
- **Not deployed.** No v2 CI/CD. `v2/` is **untracked in git**. v1 still live at
  app.simpulx.com via its own pipeline.

## Works (verified this session)

- **Auth:** login (argon2id+JWT), `last_login_at`, forgot/reset password (SMTP; dev logs
  link). End-to-end verified incl. single-use + min-length.
- **Multi-thread campaign attribution + round-robin** with the cursor-advance guard.
  Verified: campaign-B keyword opens a new conversation for Agent Dua without touching
  Agent A's thread.
- **Conversation visibility RBAC + IDOR guards** on list + all 9 per-conversation
  endpoints. Verified: agent 404s on others' conversations; admin sees all.
- **Smart auto follow-up:** 4h-gated cron → ai-agent generates human-sounding follow-up.
  Verified end-to-end.
- **Lead classification + field extraction** on inbound (no auto-reply). Verified
  `Honda/Brio/Bekasi/30 days` extracted from one message; logs show `lead classified` +
  `lead extracted`, no bot reply.
- **Smart-reply removed** (BR-17): the RAG+LLM auto-reply path is gone from
  `handle_inbound`.
- **Settings rebuilt** to enterprise structure: persistent layout, every section a real
  route, no scroll-jump, no title/description header blocks, fake Facebook button removed.
  General page functional (save workspace name). Typecheck clean; all 14 settings routes
  200.
- **People** = paginated table (role, dept chips, campaign chips, last login, status);
  edit allows admin to change email + reset password. Verified email+password edit →
  login with new creds.
- **Roles & Permissions** = permission matrix UI; `GET/PUT /api/role-permissions`
  round-trips and persists (stored in org settings jsonb).
- **Campaigns** = paginated table.
- **Message status bug fixed** (`messages` has no `updated_at`; status-only update).
- **go.mod bumped to 1.22** (fixed all `/api`+`/auth` routing 404s).

## Partial / config-only

- **Role matrix not enforced** — stored, not yet gating menus/actions.
- **SLA dashboard** — timestamps captured; metrics surface not built.
- **Call tracking** — endpoint + columns exist; mobile WA-redirect UI not built.
- **Classifier stage keys** — intent-based; not yet mapped to the action funnel that the
  DB seeds.
- **KB** — ingest works; embeddings are local hashing (keyword-level) by default;
  distill `--ingest` phase TODO; KB is empty unless seeded.
- **Knowledge base content** — `knowledge_chunks` currently empty (seed via distillation
  when ready).

## Known issues / caveats

- IDE emits stale JSX diagnostics during multi-step refactors — trust `tsc`.
- Migrations don't auto-apply to a running DB; some columns were applied by hand
  (`last_login_at`, `password_reset_tokens`).
- Realtime WS trusts `?org=` query (dev) — must move to JWT before prod.
- Demo data: org `…a1`, users `agent1@/agent2@demo.id` (`demo1234`). The big demo seed was
  wiped earlier; current DB has a small working set.

## Files of note created/changed this session

- Backend: `gateway/roles.go` (new), `users.go`, `auth.go`, `password_reset.go` (new),
  `mail.go` (new), `api.go` (RBAC guards), `messaging/store.go`+`main.go` (multi-thread),
  `db/migrations/0019_password_reset.sql`, `go.mod` (1.22).
- Web: `app/settings/layout.tsx` (new), `_shared.tsx` (new), 8 new settings route pages
  (general/branding/notifications/people/roles/departments/ai/knowledge/audit) + unwrapped
  campaigns/templates/automation/channels/integrations; `forgot-password/`,
  `reset-password/`; `lib/api.ts`, `lib/types.ts`.
- AI: `ai-agent/orchestrator.py`, `main.py`, `libs/python/.../llm.py`; `scripts/distill_kb.py` (new).
