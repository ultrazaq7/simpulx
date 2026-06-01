# 17 — DevOps

## Local environment (the only fully-wired environment for v2)

**Host needs only Docker.** No local Go or Python. (Node is used for the web app.)

```
# from v2/
make dev                         # build + run all services (compose)
make build / up / down / logs / ps
docker compose -f deploy/docker/compose.yml --env-file .env build <svc>
docker compose -f deploy/docker/compose.yml --env-file .env up -d <svc>
```

Compose project `simpulx-v2`. Containers + host ports:

| Service | Container | Host port |
|---|---|---|
| gateway | simpulx-v2-gateway | 8080 |
| conversation | simpulx-v2-conversation | 8083 |
| realtime | simpulx-v2-realtime | 8082 |
| ai-agent | simpulx-v2-ai-agent | 8000 |
| knowledge | simpulx-v2-knowledge | 8001 |
| messaging / broadcasts | simpulx-v2-* | — |
| postgres (pgvector) | simpulx-v2-db | 5442 |
| redis | simpulx-v2-redis | 6390 |
| nats | simpulx-v2-nats | 4232 |
| minio | simpulx-v2-minio | 9010/9011 |

Go services share `deploy/docker/go.Dockerfile` via build arg `SERVICE=<name>`; ai-agent
and knowledge have their own Dockerfiles.

## Web app

- Dev: `cd web && npm run dev` (port 3000; on-demand compile, first hit per route slow).
- Local prod: `npm run build && npm run start` (instant pages — preferred for demos).
- Typecheck (no local node toolchain assumptions): run via container —
  `docker run --rm -v "<abs web path>:/app" -w /app node:20-alpine sh -c
  "node_modules/.bin/tsc --noEmit -p tsconfig.json"`. **Use PowerShell or an absolute
  `-v` path; Git Bash mangles `$(pwd)`.**

## Database ops

- Migrations in `db/migrations/` run **once** on first DB init (mounted to
  `docker-entrypoint-initdb.d`). A running DB does **not** auto-apply new files.
- The team sometimes edits early migrations (e.g. `0001_core.sql`) directly, so a running
  DB may need a **manual ALTER** to match (e.g. `last_login_at`, `password_reset_tokens`
  were applied by hand during development).
- psql: `docker exec simpulx-v2-db psql -U simpulx -d simpulx_v2 -tAc "..."`.
- Run Python scripts (no local python): `docker exec simpulx-v2-ai-agent python ...` or
  `docker run --rm --entrypoint python …`; copy files in with `docker cp`.

## Critical build gotcha

- **`v2/go.mod` must declare `go 1.22`+.** Go's `net/http` method routing
  (`"POST /auth/login"`) only works at 1.22+. Under 1.21 every method-prefixed route 404s
  while `/healthz` works — looks like "the whole API broke". Keep it at 1.22.

## Testing in dev

- `WA_MOCK=true` — outbound is not really sent to Meta.
- Inject inbound via `POST http://localhost:8080/webhook/whatsapp` (waWebhook JSON; demo
  channel `phone_number_id = 1045407395325957`).
- ai-agent: `POST :8000/followup`, `POST :8000/debug/classify`.
- Demo org `00000000-0000-0000-0000-0000000000a1`; demo users `agent1@demo.id` /
  `agent2@demo.id`, password `demo1234`; `BOOTSTRAP_DEMO_PASSWORD` sets dev passwords.

## Tool-use discipline (learned the hard way)

- Do **not** batch a slow `docker build` / `go build` in the **same** parallel tool call
  as file edits — if the build errors, the whole batch cancels and edits are lost.

## Production target (v1 today; v2 not yet wired)

- VPS `root@76.13.18.144`, `/opt/simpulx`, host Nginx, Docker Compose. Domains
  `simpulx.com` (landing), `app.simpulx.com` (app + `/api` + `/socket.io`).
- **Deploy pipeline (`.github/workflows/deploy.yml`) builds + deploys v1 only**
  (NestJS API + Flutter web). **It does not touch `v2/`.** A v2 deploy pipeline must be
  built before v2 ships (see [18-roadmap.md](18-roadmap.md)). The VPS also hosts other
  apps (ncd-crm, eaziva) — do not touch them; do not bind a Docker Nginx to 80/443 while
  host Nginx serves them.
- Push to `main` triggers v1 deploy. **`v2/` is currently untracked in git** — committing
  it is a deliberate, reviewed step (avoid sweeping in scratch/PII files).
