# 13 — WebSocket Events

Live dashboard updates are delivered by the **realtime** service (`:8082`). Source:
`services/realtime/main.go` + `hub.go`.

## Connection

```
ws://<realtime>/ws?org=<organization_id>
```
- Dev slice: org comes from the query param. **Production: derive org from the JWT claim**
  (current `CheckOrigin` allows all and trusts the query — tighten before prod, see
  [16-security.md](16-security.md)).
- The web client (`Shell.tsx`) connects on mount, auto-reconnects with exponential backoff
  (cap 30s), and closes cleanly on unmount.

## Fan-out architecture

```
NATS (events.>)                Redis pub/sub                WebSocket
─────────────────              ─────────────                ─────────
message.persisted ┐
conversation.* ────┼─ realtime (queue group, ONE instance forwards)
                   │     → PUBLISH rt:events:{org_id}
                   └─ every realtime instance PSUBSCRIBE rt:events:*
                          → hub.broadcast(org_id) → all local WS clients of that org
```

This lets realtime scale horizontally: only one instance forwards each NATS event to
Redis, but **every** instance delivers to its own connected clients.

## Events forwarded to clients

| NATS subject | Meaning | Dashboard reaction |
|---|---|---|
| `events.message.persisted` | a message was stored (inbound or outbound) | refresh unread; inbound → beep + browser notification; invalidate inbox/messages queries |
| `events.conversation.assigned` | conversation assigned to an agent | refresh list / assignment UI |
| `events.conversation.closed` | conversation closed | refresh list |
| `events.conversation.handoff` | AI/system handed off to a human | refresh; (legacy from the removed auto-reply path) |
| `events.notification.alert` | cron alert (e.g. lead unreplied >15m) | sound + high-priority browser notification |

## Client payload

Each WS message is the JSON `events.Envelope`: `{ type, org_id, data }`. `data` may be a
JSON string (raw message) or an object; the client parses defensively. The web client
dispatches a window `CustomEvent("ws_message", { detail })` so any page (e.g. inbox) can
react, in addition to Shell's global handling (unread + notifications).

## Notification gating

Sounds/notifications respect org notification prefs
(`organizations.settings.notifications`: `sound`, `newMessages`, `newConversations`).
Only **inbound** messages notify (never the dashboard's own outbounds).

## Health

`GET /healthz` → `ok`. WS connection failures fall back to query invalidation on the next
poll/interaction (no hard dependency on realtime for correctness).
