# 16 — Security

## Authentication

- **Passwords:** argon2id (`m=64MB, t=3, p=4`, 16-byte salt, 32-byte key),
  constant-time compare (`auth.go`). No plaintext, ever.
- **Sessions:** JWT HS256 signed with `JWT_SECRET`, claims `{org, role, name, sub
  (userID), exp, iat}`, TTL `JWT_ACCESS_TTL` (default 900s). Bearer header (or `?token=`
  for WS/file links). `requireAuth` middleware on all `/api/*`.
- **Login** stamps `last_login_at`.

## Password reset (0019)

- `POST /auth/forgot-password` always returns a **generic 200** (no account enumeration).
- Token is random 32 bytes, **only its SHA-256 hash stored**, **1h TTL**, **single-use**
  (`used_at`). Reset invalidates all of the user's outstanding tokens.
- Delivery via SMTP (`mail.go`); when `SMTP_HOST` is unset (dev) the reset link is
  **logged** by the gateway instead of emailed. `APP_BASE_URL` builds the link.

## Authorization (RBAC)

Two layers, both enforced server-side:

1. **Tenant isolation (BR-1):** every query filters by the caller's `organization_id`
   from the JWT. Cross-tenant access is impossible.
2. **Conversation visibility (BR-20):** role-based, enforced on BOTH the list query and
   **every** per-conversation endpoint via `canAccessConversation` / `guardConversation`
   (`api.go`):
   - **agent** → only `assigned_agent_id = me`
   - **manager** → conversations in their `campaign_agents` campaigns, or unassigned
   - **admin/owner** → all
   - Unauthorized access returns **404** (never 403) to avoid leaking existence (anti-IDOR).
   Verified: an agent gets 404 on another agent's conversation across all 9 id-addressable
   endpoints (messages GET/POST, notes GET/POST, PATCH, bot, calls, assign, close).

- **User management:** non-admins may edit only their own name; email/role/status changes
  and resetting another user's password require admin/owner (`users.go`). Cannot delete
  self.
- **Role matrix:** `PUT /api/role-permissions` is admin/owner only; owner/admin are
  always full-access (dropped before save). **Caveat:** the matrix is **stored but not
  yet enforced** in the backend/sidebar — wiring menu/action gating from the matrix is a
  pending security task (see [18-roadmap.md](18-roadmap.md)).

## Transport / webhook

- Meta webhook GET verification via `META_VERIFY_TOKEN`. POST signature verification
  (`META_APP_SECRET`) should be enforced before prod if not already.
- Web API lead ingest (`/v1/leads`) uses per-source **API keys** (`X-API-Key`), stored
  per `web_api_sources`, copy/regenerate from the UI.

## Known hardening TODOs (before production)

- **Realtime WS auth:** `realtime` currently takes `org` from the query and
  `CheckOrigin` allows all. Derive org from the JWT and restrict origins before prod.
- **Enforce the role permission matrix** (currently config-only).
- **Rate limiting** on `/auth/*` and `/v1/leads`.
- **Secrets management:** no secrets in git (`.env` is local; PII working data lives in
  gitignored `v2/data/`). Production secrets via the VPS env files / a secret store.
- **CORS:** gateway `cors()` allows `*` for dev; lock to known origins in prod.
- **HTTPS/TLS** terminated at the edge (host Nginx on the VPS).

## Data protection

- Customer chat exports contain **PII** (phone, name, message bodies). The SmartKonek
  export and distillation drafts live under `v2/data/` which is **gitignored**. Never
  commit PII. Distilled KB facts must exclude customer identifiers.
- Tenant data segregated by `organization_id`; deletes cascade within a tenant.

## Audit

- `audit_log` records mutating admin actions (actor, action, entity, detail) — e.g. user
  email change / password reset, role-permission updates, channel/template changes.
  Surfaced at `/settings/audit`.
