# 08 — Design (UX & Screen Design)

How the product looks and behaves, screen by screen. Pairs with [07-design-system.md](07-design-system.md)
(tokens) and [06-information-architecture.md](06-information-architecture.md) (nav).

## Shell (global frame) — `web/components/Shell.tsx`

- **Left rail** (`#0d1b16`, dark): logo (Simpul**x**, amber x), top nav
  (Dashboard/Inbox/Contacts/Broadcasts/Follow-ups), collapse toggle, Settings at bottom.
  Collapses 72↔240px; labels fade in when open. Inbox shows an unread badge.
- **Top bar** (white): page category + title, global search (Ctrl+K dialog),
  notifications popover, user avatar menu (Profile, Sign out).
- **Live behavior:** opens a WebSocket to `realtime`; on inbound message plays a sound +
  browser notification and refreshes unread counts (respects org notification prefs).
- **Auth guard:** no token → redirect `/login`.

## Login / Forgot / Reset — dark green gradient

Centered card on a `linear-gradient(160deg,#0a1f1d…#0f2420)` field, logo on top, white
text, primary green gradient button. Forgot shows a "check your email" success state;
Reset reads `?token=` and shows a done state. Consistent across all three.

## Inbox — `web/app/inbox/page.tsx`

Three-pane: conversation list (virtualized) · message thread · details panel.
- **List item:** avatar (interest color), name, phone, last-message preview, time, status
  ticks, interest + stage + campaign chips. Role-scoped (agent sees only own).
- **Thread:** WhatsApp-style bubbles (inbound left / outbound right), date separators,
  delivery ticks, AI/agent sender labels, media (image/audio/video/doc), 24h-window aware.
- **Composer:** Reply / Internal note tabs, emoji, attach, quick-replies (`/shortcut`),
  4096-char counter, send.
- **Details panel:** contact info, stage selector (Lost opens the AI-prefilled lost-reason
  dialog), disposition, interest, extracted fields (brand/model/city/timeframe), notes.
- **Header chips:** stage selector, AI On/Off, status (Open/Pending), bot toggle.

## Settings — persistent layout

Two-column: settings sidebar (grouped nav, never remounts → no scroll jump) + content.
Every section is a real route; `/settings` → `/settings/general`. No title/description
header blocks.

- **General:** workspace name (save), workspace id, signed-in info.
- **Branding:** page title + meta title with a live "Dashboard - {title}" hint.
- **Notifications:** sound / new-message / new-conversation toggles.
- **People:** paginated table — user (avatar+online dot), role chip, department chips,
  campaign chips, status, last login (relative), joined; row menu (edit / (de)activate /
  remove). Edit dialog: name always; admin also email + role + password reset.
- **Roles & Permissions:** matrix table — permission rows grouped (Sidebar Menu,
  Dashboard, Chats, Contacts, Broadcasts, Automation, Settings) × role columns. Owner/
  Admin locked-on (lock icon). Create/delete custom roles. Save button (dirty-aware).
- **AI Agent:** read/edit card — name, system prompt, model select, temperature + handoff
  sliders, active toggle.
- **Knowledge:** add-source form + sources table (title/type/chunks/status/created).
- **Campaigns:** paginated table — campaign (icon+dealer), status, agents (chips),
  chats, leads, attribution (ad/kw chips), routing, edit/delete. Dialog for create/edit.
- **Templates:** table — name+preview, category, language, status, updated, submit/edit/
  delete. **Automation:** card grid + visual flow builder (`[id]/flow`). **Channels:**
  catalog rail + connected panel + add/test dialog. **Web API:** source cards with API
  key copy/regenerate + curl example. **Audit:** activity table.

## Interaction principles

- Optimistic where safe; toast confirmation on every mutation.
- Destructive actions confirm (`confirm()` today; dialog upgrade is a polish item).
- Empty/loading states everywhere (skeletons or spinners, centered empty states).
- Pagination for growth-prone lists; search top-left, primary action top-right.

## Mobile (planned)

Native Kotlin/Swift. Primary surfaces: inbox, thread, "Call Customer" WA-redirect, push
via FCM. See [18-roadmap.md](18-roadmap.md).
