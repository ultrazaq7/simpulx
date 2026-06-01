# 12 — API Specification

REST over HTTP/JSON, served by **gateway** (`:8080`). Source of truth:
`services/gateway/main.go`. All `/api/*` require `Authorization: Bearer <JWT>` and are
tenant-scoped to the caller's org. Per-conversation routes also enforce role visibility
(BR-20). Unauthorized resource access returns **404** (no existence leak).

## Conventions

- Auth header: `Authorization: Bearer <token>` (or `?token=` for WS/file links).
- Errors: plain-text body + HTTP status (`400` bad request, `401` missing/invalid token,
  `403` forbidden, `404` not found, `500` server error).
- IDs are UUID strings.

## Public / auth (no JWT)

| Method | Path | Body | Notes |
|---|---|---|---|
| GET/POST | `/webhook/whatsapp` | Meta payload | GET = verify (`hub.*`); POST = ingest |
| POST | `/webhook/meta` | Meta payload | Messenger/Instagram |
| POST | `/auth/login` | `{email,password}` | → `{token, user}`; stamps `last_login_at` |
| POST | `/auth/forgot-password` | `{email}` | always generic 200; emails/logs reset link |
| POST | `/auth/reset-password` | `{token,newPassword}` | single-use, ≥8 chars |
| POST | `/v1/leads` | lead JSON | **API-key** auth (`X-API-Key`), not JWT |
| GET | `/healthz` | — | liveness |

## Me / auth context
`GET /api/me` → `{id, org_id, role, name}`.

## Conversations & inbox
| Method | Path | Notes |
|---|---|---|
| GET | `/api/conversations?status=` | role-scoped list (agent=own, manager=campaigns+unassigned, admin=all) |
| GET | `/api/conversations/{id}/messages?limit=&cursor=` | guarded; resets unread on first page |
| POST | `/api/conversations/{id}/messages` | `{body,type,media_url}` → publishes outbound |
| PATCH | `/api/conversations/{id}` | `{stage_id?,disposition_id?,interest_level?,status?,lost_reason?,unread_count?}` → locks AI classification |
| POST | `/api/conversations/{id}/assign` | proxy → conversation svc |
| POST | `/api/conversations/{id}/close` | proxy → conversation svc |
| POST | `/api/conversations/{id}/bot` | `{active}` toggle bot |
| POST | `/api/conversations/{id}/calls` | `{duration_seconds}` log WA-call attempt |
| GET/POST | `/api/conversations/{id}/notes` | internal notes |

All `/api/conversations/{id}/*` pass through `guardConversation` (role check).

## Stages / dispositions / contacts / agents
`GET /api/stages`, `GET /api/dispositions`, `GET /api/contacts`, `GET /api/agents`.

## Users & roles
| Method | Path | Notes |
|---|---|---|
| GET | `/api/users` | enriched: department_names[], campaign_names[], last_login_at, open_chats |
| POST | `/api/users` | `{email,full_name,role?,password?}` |
| PATCH | `/api/users/{id}` | `{full_name?,email?,role?,status?,password?}` — email/role/status/other-user-password require admin/owner |
| DELETE | `/api/users/{id}` | cannot delete self |
| POST | `/api/users/fcm-token` | `{token,platform}` |
| GET | `/api/role-permissions` | `{matrix, custom_roles}` |
| PUT | `/api/role-permissions` | admin/owner only; owner/admin dropped before save |

## Departments
`GET/POST /api/departments`, `PATCH/DELETE /api/departments/{id}`.

## Campaigns
`GET/POST /api/campaigns`, `GET/PATCH/DELETE /api/campaigns/{id}` (agents, attribution,
routing). `GET /api/analytics/campaigns`.

## Channels
`GET/POST /api/channels`, `PATCH/DELETE /api/channels/{id}`,
`POST /api/channels/{id}/test`.

## Templates (HSM)
`GET/POST /api/templates`, `PATCH/DELETE /api/templates/{id}`,
`POST /api/templates/{id}/submit` (Meta; simulated in mock mode).

## Automations
`GET/POST /api/automations`, `GET/PATCH/DELETE /api/automations/{id}`.

## Sequences (drip / follow-up)
`GET/POST /api/sequences`, `GET/PATCH/DELETE /api/sequences/{id}`.

## Broadcasts / quick replies
`GET/POST /api/broadcasts`; `GET/POST /api/quick-replies`,
`DELETE /api/quick-replies/{id}`.

## AI & knowledge
`GET/PUT /api/ai-agent`, `GET /api/llm-models`, `GET/POST /api/knowledge` (proxy to
knowledge svc `/ingest`).

## Org / branding / settings
`GET/PATCH /api/organization` (`{name?, settings?}`; settings merged, holds branding,
notifications, role_permissions).

## Web API lead sources
`GET/POST /api/web-api-sources`, `PATCH/DELETE /api/web-api-sources/{id}`,
`POST /api/web-api-sources/{id}/regenerate-key`. Inbound: `POST /v1/leads` with
`X-API-Key`.

## Analytics / stats / audit / export / uploads
`GET /api/stats`, `GET /api/analytics`, `GET /api/audit-log`,
`GET /api/export/campaigns`, `GET /api/export/chats`, `POST /api/uploads` (multipart
`file` → S3/MinIO URL).

## ai-agent service (internal, :8000)
`POST /followup` `{conversation_id, org_id}`, `POST /debug/classify`, `GET /healthz`.

## knowledge service (internal, :8001)
`POST /ingest` `{organization_id, title, content, source_type}`, `GET /healthz`.
