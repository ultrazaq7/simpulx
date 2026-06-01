# 11 — Frontend Architecture

Web dashboard. Mobile is native and planned ([18-roadmap.md](18-roadmap.md)).

## Stack

- **Next.js 14** (App Router) + React 18 + **TypeScript**.
- **MUI** (Material UI) component library + a custom theme (`web/lib/theme.ts`).
- **TanStack Query** (`@tanstack/react-query`) for server state; **TanStack Virtual** for
  the inbox list.
- Native **WebSocket** to the realtime service for live updates.
- Session in `localStorage` (token + user).

## Directory shape (`web/`)

```
app/
  layout.tsx                  root (theme provider, fonts)
  login/ forgot-password/ reset-password/
  dashboard/ inbox/ contacts/ broadcasts/ sequences/ knowledge/ export/
  settings/
    layout.tsx                persistent Shell + settings sidebar
    page.tsx                  redirect → /settings/general
    _shared.tsx               useToast, PageBody, PageHeader, ROLES, helpers
    general/ branding/ notifications/ people/ roles/ departments/
    ai/ knowledge/ campaigns/ templates/ channels/ integrations/ audit/
    automation/  + automation/[id]/flow/
components/
  Shell.tsx                   app frame: rail, top bar, search, WS, notifications
  ChannelIcon.tsx ...
lib/
  api.ts                      typed fetch client (all endpoints)
  types.ts                    shared TS interfaces (mirror API shapes)
  theme.ts                    MUI theme (design tokens)
  utils.ts                    initials, fmtDate, color helpers
  automationMeta.ts           triggers/actions catalog
```

## Routing & layouts

- App Router. **Settings uses a shared `layout.tsx`** so the settings sidebar mounts
  once and never remounts on navigation — this is what fixes the scroll-jump and makes
  every section a real URL (no `?section=` facades). Active item from `usePathname()`.
- Auth guard lives in `Shell` (redirect to `/login` without a token). Auth pages render
  outside Shell.

## Data layer (`lib/api.ts`)

- One `req<T>()` wrapper: injects `Authorization: Bearer`, JSON headers; on 401 clears
  session and redirects to `/login`; throws on non-2xx with the response text.
- `api.*` methods are typed against `lib/types.ts`. Auth endpoints (login, forgot, reset)
  bypass the wrapper since they are pre-token.
- `API` base from `NEXT_PUBLIC_API_URL` (default `http://localhost:8080`), `WS_URL` from
  `NEXT_PUBLIC_WS_URL` (default `ws://localhost:8082`).

## Realtime (`Shell.tsx`)

- Opens `ws://…/ws?org={org_id}`, auto-reconnect with backoff.
- On event: dispatch a window `CustomEvent("ws_message")` (pages like inbox react),
  refresh unread, and for inbound messages play a beep + browser Notification (gated by
  org notification prefs).

## State conventions

- Server state via TanStack Query (cache + invalidate on mutation). Local UI state via
  `useState`. No global store; cross-page signals via window events + query invalidation.
- Tables that grow (People, Campaigns) are client-paginated (10/25/50) with search +
  filters. (Move to server pagination when row counts get large — see roadmap.)

## Conventions & gotchas

- **No per-page title/description headers** (product decision). Use `PageBody` +
  `PageHeader` from `_shared.tsx`.
- Use theme tokens, not hardcoded colors, where a token exists.
- IDE may emit **stale JSX diagnostics mid-edit** when unwrapping/refactoring; trust the
  authoritative `tsc --noEmit` over transient hook diagnostics.
- Typecheck: `docker run --rm -v <web>:/app -w /app node:20-alpine sh -c
  "node_modules/.bin/tsc --noEmit -p tsconfig.json"` (Git Bash mangles `$(pwd)` mounts —
  use PowerShell or an absolute `-v` path).

## Build / run

- Dev: `npm run dev` (port 3000, on-demand compile → first hit per route is slow).
- Local prod: `npm run build && npm run start` (instant pages). See [17-devops.md](17-devops.md).
