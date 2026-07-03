# 20 — Handoff

**Start here.** This is the orientation doc for any engineer or AI agent picking up
Simpulx v2.

## Read order

1. **[01-project-brief.md](01-project-brief.md)** — what & why.
2. **[02-business-rules.md](02-business-rules.md)** — the invariants. Read before changing logic.
3. **[19-current-state.md](19-current-state.md)** — what actually works today.
4. **[10-backend-architecture.md](10-backend-architecture.md)** + **[11-frontend-architecture.md](11-frontend-architecture.md)** — how it's built.
5. Then by need: [14](14-fair-distribution-engine.md) (distribution), [15](15-ai-engine.md) (AI), [12](12-api-spec.md) (API), [09](09-database-design.md) (DB), [16](16-security.md) (security), [17](17-devops.md) (run it).

## Doc index

| # | Doc | What's in it |
|---|---|---|
| 01 | project-brief | vision, problem, scope guardrails, stack |
| 02 | business-rules | BR-1..BR-24 invariants |
| 03 | product-requirements | FRs/NFRs with status |
| 04 | user-personas | agent/manager/admin/owner |
| 05 | user-flows | end-to-end traced flows |
| 06 | information-architecture | nav + data hierarchy |
| 07 | design-system | tokens (theme.ts), conventions |
| 08 | design | screen-by-screen UX |
| 09 | database-design | 31 tables, key columns, gotchas |
| 10 | backend-architecture | services, events, gateway internals |
| 11 | frontend-architecture | Next.js structure, data layer |
| 12 | api-spec | every gateway route |
| 13 | websocket-events | realtime fan-out + events |
| 14 | fair-distribution-engine | attribution + round-robin |
| 15 | ai-engine | classify / extract / follow-up / RAG |
| 16 | security | auth, RBAC, IDOR, TODOs |
| 17 | devops | run, build, migrate, gotchas |
| 18 | roadmap | sequenced next steps |
| 19 | current-state | honest status snapshot |
| 20 | handoff | this file |
| 21 | whatsapp-calling | WhatsApp Business Calling API scope (real calls + auto duration) |
| 22 | enterprise-revamp-plan | ACTIVE batch: enterprise CRM revamp plan + progress checklist (start here if continuing that work) |

## The six things that will bite you

1. **`go.mod` must be `go 1.22`+** or every `/api` + `/auth` route 404s (method routing).
2. **Migrations auto-apply via goose on gateway startup**, over the migrations **embedded in
   the binary** (`db/migrations/embed.go`). A new `NNNN_*.sql` MUST begin with `-- +goose Up`
   (else goose fails to parse and the gateway crash-loops), be **idempotent**, and only takes
   effect after a gateway **rebuild** (embedded, not read from disk). Still verify the live
   schema, not just the SQL.
3. **The AI does NOT auto-reply** to customers (BR-17). It classifies, extracts, drafts
   follow-ups. Don't "add back" a chatbot.
4. **Multi-thread + round-robin invariant:** resolve campaign before picking a
   conversation; only advance `rr_cursor` on a real route ([14](14-fair-distribution-engine.md)).
5. ~~**WebSocket auth is NOT implemented**~~ — **FIXED (2026-06-03).** `realtime/main.go`
   now validates JWT tokens (`?token=` param); in dev mode (default `JWT_SECRET`), it also
   accepts the legacy `?org=` param for backward compat. Production rejects connections
   without a valid token. See `parseWSToken` + `wsClaims` in `realtime/main.go`.
6. **Ownership is human-only** (BR-27). No auto-unassign, no bulk reassign. When an agent
   is deactivated, notify the manager for manual reassignment.
7. **Web is Tailwind v3.4 — never write v4-only classes** (`ring-3`, `rounded-4xl`, `size-3!`,
   `has-data-*`, `oklch color-mix`). They compile silently but generate no CSS, so the UI looks
   half-broken with a green build. The `components/ui/*` + `components/inbox/*` parallel kit is
   v4/base-ui and is the cautionary example; the active inbox is `app/(app)/inbox/components/*`.

## Conventions

- Tenant-scope every query by `organization_id`. Unauthorized resource → 404, not 403.
- **Branding: never use the word "AI" anywhere user-facing.** This is a *Customer Engagement
  Platform*. The reasoning assistant is named **Simpuler**. User-facing data fields are neutral
  (`lead_summary`, `suggested_action`, `lead_score`), not `ai_*`. Internal DB/code `ai_*` names
  (e.g. `ai_stage`, `ai_runs`) are fine — they aren't shown to users.
- UI: English, **no em dashes**, no per-page title/description headers, tables+pagination
  for growth-prone lists, use theme tokens.
- Trust `tsc --noEmit` over mid-edit IDE diagnostics.
- Don't batch a slow build with file edits in one tool call.
- Don't commit PII (`v2/data/` is gitignored). `v2/` is untracked — commit deliberately.

## Run it (local)

```
# backend (host needs only Docker)
cd v2 && make dev
# web (prod build = fast)
cd v2/web && npm run build && npm run start    # http://localhost:3000
# login: agent1@demo.id / demo1234   (admin@simpulx.com for admin)
```
Backend on :8080 (gateway), :8082 (realtime ws), :8000 (ai-agent), :8001 (knowledge),
Postgres :5442. See [17-devops.md](17-devops.md) for testing webhooks, psql, and the
build gotcha.

## Immediate next steps

- **Enterprise UI/UX overhaul (FR-29) — IN PROGRESS (2026-06-04).** Direction "total radikal",
  flagship-first = Inbox. **DONE + verified (tsc + build green):** token foundation
  (`globals.css` + `tailwind.config.js`), entire **Inbox**, the **app frame** (Shell + Login +
  forgot/reset), **Dashboard (FR-30)**, **Contacts**, and **Broadcasts** (full v1-parity 5-step
  wizard + real audience targeting + test-send, deployed live — see [19](19-current-state.md)).
  **NEXT in order:** Settings routes. **Parallel epic:** v1-parity **Automation flow builder**
  (owner wants v2 automation + broadcast to match v1 Flutter UI/UX + functionality in v2 tokens;
  needs a backend automation **executor** — none exists yet, `automations.go` is CRUD-only).
  **Foundation rule (do not violate): stay Tailwind v3.4** — the parallel `components/ui/*` +
  `components/inbox/*` kit is a v4/base-ui kit whose classes don't generate on v3 (it's why some
  screens looked broken); normalize to v3 when touched, the unwired `components/inbox/*` set is
  dead code. Full spec in [07-design-system.md](07-design-system.md) + [19](19-current-state.md).
- **Lead Intelligence engine (workstream #1)** is built and model trained ([19](19-current-state.md)):
  `make dev` to apply migrations `0026`/`0027`/`0028` + deploy the new ai-agent image; then
  end-to-end webhook burst test. The CatBoost model (`models/lead_score.cbm`) was trained on
  200 hand-labeled threads (ROC-AUC 0.857, free — no API cost). Labeling was done by an agent
  reading each transcript against a rubric (labeled.jsonl). To improve: label more threads
  from `threads_dump.jsonl` (400 total, 200 done) and retrain; or retrain on real dispositions
  once production logs won/lost outcomes.
- **Inbox decomposition DONE (2026-06-03 evening):** `ChatPanel.tsx` extracted, left panel
  swapped to `<ConversationList/>` (multi-select filters + quick toggles + sort modes),
  dead code cleaned. `page.tsx` reduced 741→~260 lines. `inbox/components/` is 100%
  Tailwind + Lucide. MUI Snackbar/Alert remains as page-level toast (extract in WS#11).
- Then [18-roadmap.md](18-roadmap.md): workstream #2 (Premium Inbox) = ~~in-conversation
  message search (Ctrl+F)~~ DONE, ~~highlight cards (lead_summary + suggested_action in
  DetailsPanel)~~ DONE, ~~WhatsApp 24h window indicator~~ DONE (card chip + composer
  banner), animated UI polish remaining. **WS#3 Call Tracking**: ~~manual call button~~
  DONE (Composer Phone icon + wa.me redirect + API log), ~~blinking call indicator~~
  DONE (ConversationCard). **WhatsApp Media Styling**: ~~WhatsApp-style rich document icons, video/image timestamp overlays, full-screen media preview modal~~ DONE. Plus MVP items (role matrix, SLA dashboard, classifier/funnel).
- **MUI removal: COMPLETE (2026-06-03).** Zero `@mui` imports in any active source file.
  All settings pages (roles, integrations, campaigns, templates, automation list + flow
  editor, channels) + inbox toast migrated to Tailwind + Lucide. Only `flow_backup.txt`
  (inactive backup) retains old MUI references. Pattern: native HTML + Tailwind classes +
  Lucide icons; settings use `_shared.tsx` (`useToast`/`PageBody`/`SectionLabel`).
- **Removed pages:** `/knowledge`, `/settings/ai`, `/sequences` — all backend-only now.
  APIs still exist (`/api/knowledge`, `/api/ai-agent`, `/api/sequences`), just no UI.
