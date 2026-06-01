# 20 — Handoff

**Start here.** This is the orientation doc for any engineer or AI agent picking up
Simpulx v2.

## What this is

Simpulx v2 — a multi-tenant, AI-assisted omnichannel WhatsApp **sales** platform for
automotive dealer networks (customer: OTO). Event-driven Go + Python microservices,
Next.js dashboard, Postgres/pgvector + Redis + NATS + MinIO. Lives in the `v2/` directory.
v1 (NestJS + Flutter) is a separate, still-live product — don't confuse them.

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

## The five things that will bite you

1. **`go.mod` must be `go 1.22`+** or every `/api` + `/auth` route 404s (method routing).
2. **Migrations don't auto-apply** to a running DB; some columns were applied by hand. Check
   the live schema, not just the SQL files. The team edits `0001_core.sql` in place.
3. **The AI does NOT auto-reply** to customers (BR-17). It classifies, extracts, drafts
   follow-ups. Don't "add back" a chatbot.
4. **Multi-thread + round-robin invariant:** resolve campaign before picking a
   conversation; only advance `rr_cursor` on a real route ([14](14-fair-distribution-engine.md)). 
5. **Role visibility is enforced (BR-20) but the role permission MATRIX is not** — it's
   config-only. Don't assume a checked box gates anything yet.

## Conventions

- Tenant-scope every query by `organization_id`. Unauthorized resource → 404, not 403.
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

See [18-roadmap.md](18-roadmap.md) "Now": enforce the role matrix, build the SLA
dashboard, reconcile classifier stages to the action funnel, improve follow-up content.
