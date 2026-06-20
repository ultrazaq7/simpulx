# 19 — Current State

Snapshot as of **2026-06-17**. This is the honest "what actually works right now" doc.

## CI/CD Level 1: build in CI -> ECR -> EC2 pulls + migrations off-boot (2026-06-20)

Deploys no longer build on the prod EC2. **GitHub Actions builds all 8 images natively on
`ubuntu-24.04-arm`, pushes `:<sha>` + `:latest` to ECR** (`825621302344.dkr.ecr.ap-southeast-3
.amazonaws.com/simpulx/*`, 8 repos), cache `type=gha`. The **deploy** job SSMs the box to:
ECR-login (instance role `simpulx-ssm-role` has `ecr-pull`), `docker compose pull`, run the
**dedicated migrate step**, `up -d`, restart caddy — **prod never builds**. Verified end-to-end:
cold first run ~6 min, app 200.

- **Migrations decoupled from boot** (`gateway/main.go`): `MIGRATE_ONLY=true` runs goose then
  exits (used by the deploy step); `RUN_MIGRATIONS_ON_BOOT` (default true for dev) is **false**
  in prod (`compose.prod.yml`) so app boot never migrates. Going forward use expand/contract.
- **Rollback** = run the `Deploy Simpulx` workflow via `workflow_dispatch` with an older
  `image_tag` (build is skipped; deploy pulls that tag). Images are immutable per SHA in ECR.
- IAM: OIDC role `simpulx-gha-deploy` got inline `ecr-push`; instance role got `ecr-pull`
  (both scoped to `repository/simpulx/*`). Web build args come from GitHub repo **variables**
  (`NEXT_PUBLIC_META_*`); `META_APP_SECRET` stays a runtime `.env` secret.
- `compose.prod.yml` services now `image: .../simpulx/<svc>:${IMAGE_TAG:-latest}` (pull);
  base `compose.yml` keeps `build:` for local dev. Dockerfiles gained cache layers
  (`go.Dockerfile`: go.mod download layer + BuildKit cache mounts; `web/Dockerfile`: npm +
  `.next/cache` mounts). Old build-on-box path replaced in `.github/workflows/deploy.yml`.
- **paths-filter (done):** a `changes` job (dorny/paths-filter) builds only the services whose
  source changed; unchanged ones are re-tagged `latest -> :sha` via `ecr put-image` (no rebuild),
  so every commit still has a full set of immutable `:sha` tags. Verified: workflow-only push
  re-tagged all 8, zero builds, ~1m15s. Measured: cold ~6m, warm ~1.5m (was ~8m on-box).
- **Next steps (Level 2, later):** staging env + e2e gating + manual approval + zero-downtime
  (blue-green/rolling); optionally skip the deploy job when nothing changed. Use expand/contract
  for schema changes.



## Campaigns with branches (group -> sub-units) + enterprise wizard (2026-06-20)

A campaign is now a **group** (e.g. "UMC") that can contain many **branches** (sub-units:
offices/stores; generic, not automotive-only). Each branch has its own coverage, ad sources
and agents. A lead routes **by ad source** to the matching branch, then round-robin among
that branch's agents; with no matching branch it falls back to the campaign's default agents.
Branches are **optional + backward compatible** (a campaign with zero branches behaves exactly
as before). Verified end-to-end on prod (web lead via a branch's source → conv.branch_id +
campaign_id + the branch's agent; per-branch rr_cursor).

**Backend (migrations 0048 + 0049):** `campaign_branches` (name, coverage, ad_source_ids[],
rr_cursor, lead_count), `branch_agents`, `conversations.branch_id`, `web_api_sources.branch_id`.
(0048 first shipped as "dealer"; 0049 renames dealer→branch in place since Simpulx is not
automotive-only — pre-existing `campaigns.dealer_name` untouched.) Routing: gateway
`routeToBranch` (handleIngestLead uses web source's branch_id) + messaging `routeToBranch` /
`resolveBranchByReferral` (CTWA, checked before campaign; mirrors the fair-distribution locks);
`getOrCreateThread` now keyed per-branch. Branch CRUD: `gateway/branches.go` under
`/api/campaigns/{id}/branches` + `/api/branches/{id}` (gated manage_campaigns).

**Frontend:** `CampaignWizard.tsx` (Campaign → Branches → Review) replaces the old campaign
dialog, reusing the shared `WizardModal`. New polished `components/AgentMultiSelect.tsx`
(avatar chips, search, select-all, removable pills) used per branch + for campaign default
agents. `lib/api.ts`: listCampaignBranches/createBranch/updateBranch/deleteBranch; `Branch` type.
Wizard create/edit diffs branches (create/update/delete). The old `dealer` field is relabeled
"Company / group" in the UI (still maps to `dealer_name`).



## Channel & Integrations merge + real Create-Channel wizard (2026-06-20)

Merged three settings nav items — **Channels**, **Web API Sources**, **Ad Performance** — into
one section **Channel & Integrations** at `/settings/channels`, with **top tabs**
(`?tab=channels|webapi|advertising`, URL-driven). The old `/settings/integrations` and
`/settings/ads` routes are now thin client redirects to the right tab (bookmarks survive). Nav
relabelled via new locale key `settings.channels_integrations` (+ `tab_web_api`, `tab_advertising`).

**Channels tab** is a clean enterprise card grid (search + platform filter chips); platform
selection moved into a real **3-step Create Channel wizard** (`ChannelWizard.tsx`: Select channel →
Channel details → Setting up). Page split into `ChannelsTab.tsx` / `WebApiTab.tsx` /
`AdvertisingTab.tsx` under `settings/channels/` (Web API + Advertising are straight ports of the old
pages, behaviour unchanged). Old left-rail catalog removed.

**Real wiring (no stubs):**
- **WhatsApp — Embedded Signup (full auto-provision):** real Facebook JS SDK popup
  (`lib/fbSignup.ts`) returns code + waba_id + phone_number_id → `POST /api/channels/embedded-signup`
  (`gateway/channels.go`) exchanges the code (`META_APP_ID`/`META_APP_SECRET`), subscribes the app
  to the WABA, registers the number, saves the channel `connected`. Dev-safe: with creds blank it
  saves `pending` + warning. Also a **Direct Cloud API** manual path (shows webhook URL + verify
  token, collects system-user token / WABA / phone-number id → existing `createChannel`).
- **Viber (now `available: true`):** wizard collects the Public Account auth token →
  `POST /api/channels/viber/connect` verifies it via Viber `get_account_info`, registers
  `PUBLIC_API_URL/webhook/viber/{id}`, saves the channel. Inbound handler `viber_webhook.go` mirrors
  `meta_webhook.go`; routes by **channel id in the path** (Viber payloads omit the PA id), so
  `messaging/store.go resolveChannel` was extended with `OR id::text = $1`. **Outbound now works too**
  (`messaging/viber_sender.go`): `onOutbound` dispatches by `sendTarget.ChannelType`; `sendTarget`
  now also returns channel type/name + the contact psid (Viber user id) and posts to Viber
  `send_message`. Text + images send natively; video/audio/document go out as a link (Viber requires
  a file size we don't track). Mock-gated by `WA_MOCK`.

**New routes:** `POST /api/channels/embedded-signup`, `POST /api/channels/viber/connect` (both
gated `manage_channels`), `POST|GET /webhook/viber/{id}` (unauthenticated, like `/webhook/meta`).

**New env (gateway `.env`):** `META_APP_ID`, `META_CONFIG_ID`, `PUBLIC_API_URL`. **Web build args**
(`web/Dockerfile` + `compose.prod.yml`, baked at build): `NEXT_PUBLIC_META_APP_ID`,
`NEXT_PUBLIC_META_CONFIG_ID`, `NEXT_PUBLIC_META_VERIFY_TOKEN` (display-only). In prod
`PUBLIC_API_URL=https://app.simpulx.com` (Caddy already proxies `/webhook/*` → gateway). Verified:
`go build`/`go vet` gateway+messaging clean, `npm run build` clean (27 routes). **User still needs to
paste their Meta App ID + Embedded Signup config_id into `.env` for the FB button to appear.**

## Account-state model + presence/billing (2026-06-17)

Locked the user-account state model into **3 independent axes** (was previously conflated, which
let the old user-menu toggle write `online/offline` into `users.status` — that corrupted the
active/inactive gate and even locked the super admin `admin@simpulx.com` out of login):

1. **Presence** — `is_online` (+ `last_seen_at`). **Feeds agent-performance metrics**
   (availability / online time); **no effect on lead distribution or billing charges**, but it IS
   measured. Set true on login; toggled via new self endpoint `PATCH /api/users/me/presence`
   (ungated, any user). Shell user-menu toggle now hits this (optimistic + revert-on-failure),
   with an animated dot + Online/Offline label. Online/offline transitions are recorded in
   `user_activity_events` (see below) so online-time / availability can be computed.
2. **Active/Inactive** — operational `status` (`active|inactive`, gates login + lead routing)
   mirrored into billing flags `is_inactive` + `inactive_since`. Activate/Deactivate keeps both
   in sync. **Only `status='active'` gates distribution** (see [14](14-fair-distribution-engine.md));
   `pickAgent` no longer biases by `is_online`.
3. **Deleted** — `is_deleted` + `deleted_at`. **Soft delete (tombstone):** keep the row so history/
   attribution survives, force inactive, drop presence, suffix email (`+deleted-<id>`) to free it,
   reassign open leads with audit events + `AgentDeactivated` kick. Hidden from lists/routing/login.

**Activity log (BUILT 2026-06-17):** `user_activity_events` (append-only) records every real
presence (online/offline) and lifecycle (active/inactive/deleted) transition with `at` + `actor_id`;
no-op repeats are skipped (verified). Written from login (online), `PATCH /api/users/me/presence`
(online/offline), Activate/Deactivate + soft delete (lifecycle). This is the single source of truth
for both **agent-performance presence metrics** (online time / availability) and **accurate
multi-cycle billing spans** — neither is derivable from the scalar `is_online`/`is_inactive`/
`is_deleted` columns alone. Helper `logUserActivity` in `gateway/users.go`.

**First metrics endpoint built (2026-06-17):** `GET /api/users/{id}/activity?from&to` reconstructs
sessions from the log (window-clipped, open session counts to now) → `presence{online_seconds,
online_hours, availability_pct, sessions, currently_online, last_online_at}` + `billing{active_seconds,
active_days, is_inactive, is_deleted}`. Visibility: self, or admin/owner/manager for any org user.
Verified against synthetic + live data (a closed 1h session = 3600s; full-window active = 86400s).
**Still TODO:** an agent-performance dashboard UI on top of this endpoint; manager scope is currently
org-wide (not yet limited to their campaign agents).

Migrations `0034_user_soft_delete`, `0035_user_lifecycle_flags`, `0036_user_activity_events`. Touched: `gateway/auth.go`
(login presence), `gateway/users.go` (presence endpoint, soft delete, flag sync, list fields),
`gateway/api.go` (agents filter), `conversation/store.go` (pickAgent), web `Shell.tsx`,
`settings/general` (custom language dropdown + live `setLang`), `account/page.tsx` (i18n + meta
title via `/account` in PAGE_TITLES), locales. All transitions verified against the live DB;
gateway+conversation rebuilt; `tsc --noEmit` clean.

## Enterprise UI/UX overhaul — IN PROGRESS (2026-06-04)

Owner started the full web overhaul (FR-29). Direction = **"total radikal"** (free to redefine
palette/layout incl. shell, within Simpulx green+amber), **flagship-first = Inbox**. Full design
spec + foundation decision live in [07-design-system.md](07-design-system.md).

- **Foundation decision LOCKED: stay Tailwind v3.4, do NOT migrate to v4.** The stalled
  parallel-frontend kit in `web/components/ui/*` + `web/components/inbox/*` (base-ui + shadcn) was
  written for **Tailwind v4** (`ring-3`, `rounded-4xl`, `has-data-*`, `oklch`) so its classes
  silently don't generate on v3 — that's why login/inbox looked subtly broken. Normalize to clean
  v3 when touched. The `components/inbox/*` context-based set is **NOT wired** (page.tsx still uses
  the working `app/(app)/inbox/components/*`) — dead code, normalize-or-delete later.
- **Token system rebuilt** = single source of truth: `web/app/globals.css` (semantic
  success/warning/info/amber + sidebar tokens + premium scrollbar + `.skeleton` shimmer +
  Inter font-features) + `web/tailwind.config.js` (semantic + sidebar + amber colors, enterprise
  shadow ramp `shadow-xs..2xl`+`brand-md`, `bg-brand-gradient`, motion keyframes). New helper
  `relTime()` in `lib/utils`.
- **DONE + verified (`tsc --noEmit` clean + `next build` 25 routes, each step):**
  (1) entire **Inbox** — ConversationCard / ConversationList / MultiSelectFilter / ChatPanel /
  MessageBubble / Composer / DetailsPanel / LostReasonDialog (full-bleed rows, left accent bars,
  channel-dot avatars, brand/card bubbles, no pulsing chips; all complex logic — virtualizer,
  Ctrl+F, audio waveform, recording — untouched). (2) **App frame** — Shell (sidebar gradient +
  brand active accent + brand-gradient avatar + tokenized topbar/menus), Login (rebuilt
  split-screen, on-brand green button, dropped black `bg-slate-900` button + broken v4
  primitives), forgot-password + reset-password (premium centered cards). (3) **Dashboard
  (FR-30) — ROLE-AWARE:** agent gets an action-center (5 clickable cards My open/Hot/Follow up/
  Need to call/Unread → filtered inbox, personal chart + interest split, no org analytics/lead
  score) fed by a **new endpoint `GET /api/dashboard/cards`** (`gateway/api.go`, role-scoped like
  stats); manager/admin get the full analytics dashboard (manager already campaign-scoped via
  `campaign_agents`). Also: real `analytics.daily` chart (removed fabricated `generateChartData`),
  "AI Handled"→"Assisted" (no-"AI" fix), inbox reads URL params on mount to set filters.
  **Gateway deployed + endpoint verified live** (healthz 200, authed agent1 → `open:1`). (4)
  **Contacts** — token rewrite, dropped redundant per-page `<h1>`, uppercase-muted table,
  channel-dot avatars, tokenized pagination. **Buttons now functional (not mockup):** Export =
  client CSV; Add/Edit = real modal → new `POST /api/contacts` + `PATCH /api/contacts/{id}`
  (tenant-scoped, IDOR 404), verified live via hot-swap deploy.
- **Dashboard data-accuracy overhaul + Manager Control Tower (2026-06-04, deployed + verified):**
  Manager home is now role-aware Live ops (**Control Tower**: status band → attention/intervention
  stream → live agent-load lanes) ⟷ Reports. Backend analytics rewritten for accuracy: Replied =
  AGENT replied, Won = reached final **Booking** stage, response time excludes bot, real
  `funnel_stages` (cumulative pipeline + conversion), lost/lost_reasons now returned. One
  `fmtDuration()` everywhere. **Pipeline:** SPK+Delivered → single **Booking** stage
  (mig `0029`). **Lost flow fixed:** inbox stage menu → "Mark as lost / spam" sets disposition +
  reason (Lost is a disposition, not a stage). Removed "Select all/Clear all" from inbox filters.
- **Campaign ↔ channel wiring + calling gate (2026-06-04, deployed + verified):** added
  `campaigns.channel_id` (FK channels) + `channels.calling_enabled` (mig `0030`). A campaign now
  carries a **channel** (hard dependency for routing). `/api/conversations` returns
  `calling_enabled` (derived campaign→channel); the inbox **call button is hidden unless the
  channel has calling enabled** — provisions the WhatsApp Calling work without exposing a dead
  button (OTO's channel gets `calling_enabled=true` later). Campaigns settings page redesigned
  (tokenized): removed the store icon, Agents column = count, new Channel column, form gained a
  Channel selector + Agents as a **multi-select-with-search** (reuses inbox `MultiSelectFilter`).
- **Role-aware agent + filters (2026-06-04, deployed + verified):**
  - **Inbox:** manager/admin now see the **assigned agent** on each conversation card + in the chat
    header (agents don't — they only see their own), plus an **Agent multi-select filter** in the
    conversation list (gated `role !== 'agent'`). Frontend-only (data already on the conversation).
  - **Contacts:** added free-text **tags** (`contacts.tags text[]`, mig `0031`, GIN index) — tag
    chips on rows, a tag editor (with suggestions) in the add/edit modal, tags in CSV export.
    New **filter row**: Tags (all roles), **Agent** (manager+), **Campaign** (admin/owner) via
    `MultiSelectFilter`. `/api/contacts` now also returns `tags`, `assigned_agent_id`,
    `agent_name`, `campaign_id`, `campaign_name`; create/update accept `tags`.
- **Broadcast Production (v1 parity) — DONE + verified live (2026-06-04):** owner wants v2
  automation + broadcast to match **v1 (`legacy-v1/frontend` Flutter)** UI/UX **and** functionality,
  rendered in v2 premium tokens (not v1's generic blue). Broadcast shipped first. The basic
  1-dialog page is replaced by a **5-step wizard** (Name -> Channel[type+number] -> Audience ->
  Message -> Review) in `web/app/(app)/broadcasts/page.tsx`, faithful to v1's flow:
  - **Audience targeting now REAL** (was always "all"): All (+ optional **tag** filter via
    `contacts.tags && $tags`) or **Selected contacts** (search + checkboxes + **Import phone
    numbers** paste-match by suffix). Live recipient estimate + **cost estimate** (template
    $0.0466 / text $0.0118). WhatsApp **device preview** (phone mockup) on Message/Review.
  - **Test send** to one contact before launch (reuses the real `message.outbound` path).
  - **Send-now toggle** = Create & send vs Save as draft.
  - **List = paginated TABLE (not cards, 2026-06-04):** columns Broadcast (status icon + name +
    template badge + preview) / Status / Audience / Delivery (sent/total + progress + failed) /
    Created / actions (Send now [draft/scheduled/failed] · See details · Delete). Search box +
    client-side pagination (10/25/50), row click -> detail. Matches the Contacts/People table
    pattern (design rule: growth-prone lists = paginated tables). Backend `listBroadcasts` LIMIT
    raised 50 -> 200 (true server-side pagination is a later item per [18](18-roadmap.md)).
  - **Backend (gateway, deployed via hot-swap):** `handleCreateBroadcast` now honors
    `channel_id` + `audience`/`tags`/`contact_ids` + `send_now` (resolves recipients into the
    `broadcast_recipients` snapshot the worker already reads; `audience` col = label all|tags|
    selected). New endpoints `POST /api/broadcasts/test-send`, `POST /api/broadcasts/{id}/send`,
    `DELETE /api/broadcasts/{id}` (all tenant-scoped, IDOR 404). List query returns `audience`+`body`.
  - **Verified live** (agent token, org a1): selected->1, tag=vip->1, tag=nope->0, test-send
    delivered to a real WA number (testing channel c1), draft->send->queued->delete 204, random
    delete/invalid contact 404. tsc + next build green. **NOTE:** test-send + send are LIVE — they
    deliver real WhatsApp messages (went to demo contact 6281315210146).
  - **DUPLICATE-SEND BUG FIXED (2026-06-04):** owner saw "1 recipient, 2 sent" (and a test
    delivered 2-3x). Root cause: the worker loop did `publish -> markRecipientSent` (read-then-
    write, not atomic), so a redelivered/replayed `BroadcastRequested` (JetStream `DeliverAll` +
    durable, esp. on a service restart) re-sent; the messaging dedup is keyed on `externalID`
    which the **dev mock sender assigns fresh per attempt**, so duplicates slipped through. Fix:
    `services/broadcasts` now **claims each recipient atomically** (`UPDATE broadcast_recipients
    SET status='sent' WHERE id=$ AND status='pending'`, only the winner publishes + bumps) =
    exactly-once per recipient regardless of redelivery/concurrency. Hot-swap deployed + verified
    (clean run: total=1, sent=1, exactly 1 message). **Deeper caveat still open:** `messaging.
    onOutbound` itself isn't idempotent against replay (no stable idempotency key on
    `message.outbound`; mock externalID is random) so a *messaging* restart could still replay
    agent/bot outbound. Real fix later = stable client-side message id on the event + dedup on it.
  - **Detail report — DONE + verified (2026-06-04):** v1-parity report at `/broadcasts/[id]`
    (`web/app/(app)/broadcasts/[id]/page.tsx`), opened via card click / "See details".
    **General tab:** 6 stat cards (Recipients/Sent/Read/Responses/Response rate/Est. cost),
    Delivery + Engagement segmented bars, meta panel (name/type/channel "sent by"/template/
    audience/created/created by), WhatsApp preview. **Messages tab:** per-recipient table
    (Customer/Number/Send status/Read status/Type/Responded) + quick filters (All/Sent/Pending/
    Failed/Responses) + search + CSV download. Backend (gateway): `GET /api/broadcasts/{id}`
    (detail + derived read_count/responses via message joins), `GET /api/broadcasts/{id}/recipients`
    (per-recipient with read status + replied, best-effort lateral join on `messages`), `POST
    /api/broadcasts/{id}/retry` (failed->pending + re-queue).
  - **Real recipient<->message link — DONE (2026-06-04):** replaced the best-effort time-window
    joins with a real FK-style link. Migration **`0032`** adds `broadcast_recipients.message_id`
    (plain `uuid`, **not** a FK because `messages` is a PARTITIONED table so `id` alone isn't
    unique). Flow: worker puts `broadcast_recipient_id` on the `message.outbound` event ->
    `messaging.onOutbound` calls `linkBroadcastRecipient(recipID, msgID)` after persisting ->
    report joins `broadcast_recipients.message_id` -> `messages.status` for **real**
    delivered/read counts. Detail now returns real `read_count` + `delivered_count`; per-recipient
    `read_status` is the linked message's status; `responses`/`responded` are precise (inbound
    after that recipient's `sent_at`). "Read status" funnel bar = Read/Delivered/Sent. Verified
    live: link set (`message_id` populated), counts FK-based, still exactly-once. Touched 3 Go
    services (gateway, messaging, broadcasts) + events lib — all hot-swapped.
  - **Remaining (WS#8 polish):** avg-response-time card; persist `delivered_count`/`read_count`
    as broadcast columns (currently derived live each request — fine at current scale).
- **NEXT v1-parity target = Automation flow builder.** v1 has a full **visual node editor**
  (`legacy-v1/.../flow_builder_page.dart`, 4618 lines, 12 node types incl. Criteria Router branching,
  Interactive Message, Google Sheets); v2's is a **linear vertical step list** (310 lines). Owner
  approved building the v2 backend **executor** (none exists today; `automations.go` is CRUD-only)
  so the builder actually fires. Bigger lift than broadcast.
- **NOT yet redesigned (raw/old styling):** other Settings routes. Campaigns sub-tab
  analytics (`handleCampaignAnalytics`) still uses old won/strong defs.

## Broadcast CTA buttons → click tracking + button_click automation (2026-06-04)

Closes the loop: broadcast generates a unique per-recipient callback, a tap is tracked + can
trigger automation. Four parts, all wired + verified (except the real Meta button SEND, which is
mock in dev):

- **Capture (#2):** inbound quick-reply / interactive button taps now propagate the callback id.
  `events.InboundMessage.ButtonPayload`; `whatsapp.go buttonPayload()` reads `interactive.
  button_reply.id` / `button.payload` (was dropped — `extractText` only kept the title); set in
  `ingest`. Verified: a `button_reply` webhook carries `REC123.daftar` through.
- **button_click trigger (#3):** new automation trigger. `triggerMatches` fires when the inbound
  has a payload and (optional `trigger_config.callback` substring matches, else any button).
  Added to the executor query, `lib/automationMeta` TRIGGERS, the flow Inspector + Edit dialog
  (a "Callback id contains" field). Verified live: tapping "Daftar" fired the rule → auto-reply.
- **Callback generation (#1):** the broadcasts worker sets `MessageOutbound.CallbackID =
  "bc_<broadcast_recipient_id>"` per recipient. On a REAL Meta template send this is attached as
  each quick-reply button's payload so a tap maps back to the recipient. ⚠️ **Dev is WA_MOCK**, so
  the actual button send isn't exercised here — the plumbing + tracking are prod-ready; verify the
  real template-with-buttons send when wiring live Meta.
- **Click tracking (#4):** migration **`0033`** adds `broadcast_recipients.clicked_at` +
  `clicked_button`. `messaging.onReceived` → `trackBroadcastClick` parses `bc_<id>.<button>` and
  marks the recipient (COALESCE = first click wins, `id::text` guard = safe on junk payload).
  Report: detail returns `clicks`; recipients return `clicked`/`clicked_button`; UI got a **Clicks**
  stat card + **Clicked** quick filter + **CTA** column. Verified live: simulated tap → recipient
  `clicked=t button=daftar`, broadcast clicks=1.

## Automation executor — LIVE (2026-06-04)

Automations used to be CRUD-only (stored `flow`/`actions`, never executed). They now **actually
run**. New file `services/messaging/automations.go`; `runAutomations` is called from `onReceived`
right after an inbound message persists (best-effort, never blocks ingest).

- **Triggers:** `new_message` (every inbound), `keyword_match` (body contains a configured
  keyword), `new_conversation` (first inbound of a conversation — the message-count check only
  runs when a new_conversation rule exists). Channel-scoped (`channel_id IS NULL` = any).
- **Actions:** `send_message` (publishes a `system` outbound — NOT labelled Simpuler, empty body
  is a no-op), `add_tag` / `remove_tag` (mutates `contacts.tags`), `assign_agent` (by id or
  full_name), `close_conversation` (`status='closed'`), `webhook_notify` (async POST).
  `send_template` / `assign_team` / `set_priority` are recognised but **not yet executed** (no
  `conversations.priority` column for the latter).
- **Flow model:** prefers the visual `flow` (walks nodes from the trigger along edges, skipping
  trigger + condition nodes); falls back to the legacy `actions[]`. Node `config` keys == action
  `params` keys (message/tags/agent_name/url), so both paths share `execStep`.
- **Verified live (signed webhook):** keyword "promo" inbound → automation fired (steps=2) →
  `system` auto-reply persisted + contact tagged `promo-interest` + `run_count++`. A `new_message`
  rule also fired (proving that trigger). Empty-message rule = no-op (no spam).
- **⚠️ Behaviour change:** any **active** automation is now LIVE the moment it's enabled (before,
  enabling did nothing). Audit existing active rules before relying on this in prod.
- **Visual node CANVAS — BUILT (2026-06-04).** Replaced the linear step-list editor with a real
  free-form node canvas using **React Flow** (`@xyflow/react`, new dep). New full-width route
  **`app/(app)/automation/[id]/flow/page.tsx`** (moved OUT of settings so it gets the whole canvas
  — just the main rail, no settings sidebar; old `settings/automation/[id]/flow` deleted, list
  relinks to `/automation/{id}/flow`). Features: draggable custom nodes (token-styled, accent +
  kicker WHEN/IF/DO per kind), source/target handles, drag-to-connect edges (animated bezier),
  pan/zoom + dots Background + Controls + MiniMap, node palette popover (Add node), right-drawer
  Inspector with per-kind config (reuses the field set), delete node/edge, Save -> `flow` model
  (`{nodes:[{id,type,x,y,config}],edges:[{from,to}]}`) + trigger node writes `trigger_config`.
  **Backward compatible:** loads existing `flow`, or seeds a trigger + nodes from legacy
  `actions[]`. Nodes the executor doesn't run yet show a "soon" badge (honest). Verified: `tsc` +
  `next build` green (route 62.7 kB). Smoke-test the drag/connect/save in the running app.
- **STILL not built:** branching (`condition` node is placeable + savable but the executor walks
  linearly, ignoring branch logic); cron triggers (`conversation_idle`/`office_hours`/
  `after_hours`); `ad_click` / `contact_tag` triggers; `send_template`/`assign_team`/`set_priority`
  action execution.

## Lead Intelligence engine + LLM efficiency (2026-06-03, built earlier)

Workstream #1 of the Customer Engagement Platform roadmap ([18](18-roadmap.md)). Two brains:
**CatBoost** buy-potential score + **Simpuler** (LLM) reasoning. See [15](15-ai-engine.md) for design.

- **Status: code built + verified; CatBoost model TRAINED (bootstrap); NOT yet deployed.**
  - Migrations `0026` (renamed non-AI cols `lead_summary`/`lead_priority`/`suggested_action`
    (+reason+confidence)/`lead_score`*) + `0027` (`ai_extracted_at`, `ai_agents.model` default
    → `claude-sonnet-4-6`, name → **Simpuler**) validated against the live DB via `ROLLBACK`.
    The demo agent was already on Sonnet.
  - ai-agent image **rebuilds** with `catboost==1.2.7` (needs `numpy<2`; pinned `1.26.4`; libgomp1).
  - Verified in-image: imports, feature + normalizer parity, CatBoost train→`.cbm`→predict
    round-trip, and the change-gating logic (`_should_analyze`).
  - **CatBoost model trained (2026-06-03, free — no API cost).** 200 threads hand-labeled
    (agent read each transcript; rubric in labeled.jsonl). ROC-AUC **0.857** (gate 0.70 PASS),
    PR-AUC 0.570, Precision@10% 0.500, Precision@20% 0.625. Top features: `n_inbound`,
    `total_msgs`, `cat_brand`, `cat_city`, `intent_category_count`, `intent_price_financing`.
    Model artifact: `services/ai-agent/models/lead_score.cbm` + `model_card.json` (version
    `bootstrap-20260603-0923`). 44 positives / 200 rows (22% base rate).
- **To go live (remaining):** (1) `make dev` to apply migrations + deploy the new image;
  (2) end-to-end webhook burst test (`POST /debug/reply` at ai-agent :8000).
- **LLM efficiency:** routine model Opus → **Sonnet**; `llm.generate` split into `analyze()`
  (no wasted reply) + `draft_followup()`; **change-gated** calls + 45s burst cooldown so a
  flurry of short messages = ~1 call; static-prompt caching; token `usage` logged.
- **Branding:** zero "AI" wording in user-facing fields/labels; assistant named **Simpuler**.
- **Embeddings:** `EMBED_PROVIDER=openai` now (was local) → re-embed any existing KB.

## Pre-production audit (2026-06-03)

67 findings from code + doc cross-reference. **4 code P0s fixed (2026-06-03):**
1. ~~**WS tenant IDOR**~~ → ✅ JWT auth implemented in `realtime/main.go`.
2. ~~**No webhook signature verification**~~ → ✅ HMAC-SHA256 via `META_APP_SECRET`.
3. ~~**No rate limiting**~~ → ✅ IP-based token bucket in `gateway/ratelimit.go`.
4. ~~**Race condition**~~ → ✅ `pg_advisory_xact_lock` in `messaging/store.go`.
5. **v2 not in git** — still open (operational, not code).

12 P1s include: outbox poller missing index, follow-up cron cost bomb (no throttle),
keyword substring matching fragility, conversation list no pagination, agent deactivation
orphans conversations (notification to manager not implemented yet — BR-27).

Business rules added this session: BR-25 (in-app notification only), BR-26 (notification
settings), BR-27 (ownership human-only, no auto-unassign).

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

- ~~**Role matrix not enforced**~~ → **ENFORCED (2026-06-04).** The stored matrix now actually
  binds, both sides:
  - **Backend (real gate):** `gateway/permissions.go` adds `gate(perm, handler)` middleware +
    `hasPerm` (owner/admin always full; else saved `matrix[role][key]`, else `defaultPerm` which
    MIRRORS the UI). Wired on mutations + section reads: contacts (view/create/edit), broadcasts
    (view/send), automation (view/manage), channels/users/departments/campaigns/quick-replies
    (manage_*). Denied => 403. **NOT gated:** `/api/analytics` + `/api/stats` (the agent dashboard
    pulls its own role-scoped analytics; gating would blank the agent's own chart — analytics is
    already row-scoped server-side). Verified live: agent1 → 403 on broadcasts/automations/
    campaigns/users, 200 on contacts (has create/edit).
  - **Frontend (binds to checklist):** `web/lib/permissions.ts` (`defaultFor` mirrors backend +
    cached matrix + `usePermissions().can()`). Shell sidebar hides menus by `menu_*`; settings
    sub-nav (`settings/layout.tsx`) hides sections by perm (empty groups drop); action buttons
    gated — broadcasts New/Send/Delete (`send_broadcasts`), contacts Add/Edit/Export
    (`create_/edit_/export_contacts`), automation New/toggle/edit/delete (`manage_automation`).
  - **3 places encode the same defaults — keep in sync:** `permissions.go defaultPerm`,
    `lib/permissions.ts defaultFor`, roles page `defaultFor`. Gap: no perm yet for branding/
    notifications/Web API (fall back to `view_settings`); org PATCH (branding) is ungated.
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
- Demo data: org `…a1`, users `agent1@/agent2@demo.id` (`demo1234`). The big demo seed was
  wiped earlier; current DB has a small working set.

## Premium Inbox + roadmap expansion (2026-06-03, brainstorming session)

Extensive brainstorming with product owner refined the roadmap ([18](18-roadmap.md)) from
4 workstreams to **12** (incl. Dashboard Overhaul FR-30). Key decisions:

- **Lead score hidden from agents** (BR-28) — angka 0-100 ga ditampilin, cuma dipake buat
  sorting Prioritas. Interest chips (Hot/Warm/Cold) jadi visual indicator utama.
- **"Call First" → dropped**. Platform ini chat-first, bukan call center. Diganti:
  - ⚡ **"Segera Follow Up"** quick-toggle filter = Hot/Warm + unread convos.
  - 📞 **Blinking call indicator** = Hot + >3 msgs + never called → signal to try calling.
- **Filters redesigned**: multi-select checkboxes with search + select-all. Channel/source
  filter removed (agent sees only own convos — useless). Kept: Status, Stage, Campaign,
  Interest.
- **Call feature**: dual-mode (API call if WA supports it, deeplink fallback). Call logs
  distinguish `api` vs `manual`. Start with simple deeplink, full API phase 2.
- **Multi-industry**: `campaigns.business_type` field. Currently `automotive_new` only;
  planned: `financial_services`, `healthcare`, `real_estate`, `automotive_used`,
  `automotive_refinance`. Conversation detail fields become dynamic via `custom_fields` jsonb.
- **System Logs + Export + Downloads**: new pages. Message log format aligns with data-train
  CSV. Conversation log shows deep metrics (1st RT, avg RT, follow-ups, calls). Export jobs
  with real-time progress via WS.
- **WhatsApp Flows** (FR-26): lead form, booking, survey via WA native UI. Automation
  integration with `flow_response` trigger + `send_flow`/`update_fields`/`assign_agent` actions.
- **Broadcast Production** (FR-12 upgrade): 6-step wizard, detail page with stats/charts,
  dedicated backend worker with Meta rate limiting.
- **Contact Detail** (FR-27): 3-column profile page — left (profile+properties), center
  (activity log/associations/remarks/media tabs), right (labels/lists). Unified timeline
  across all campaigns.
- **Template Enhancement** (FR-28): campaign-linked templates, ownership scoping, Meta sync,
  delivery stats, real-time WA phone preview.
- **Design System + UI/UX Overhaul** (FR-29): page transition flicker fix (Suspense +
  animated Shell wrapper), micro-interactions, data viz, settings overhaul, premium polish.
  Brand color `#2D8B73` correct but underutilized.
- **Dashboard Overhaul** (FR-30, WS#12): informative/professional/complete, real data only
  (no NaN/fabricated/weird numbers). Agent-critical CLICKABLE cards → deep-link to a filtered
  Inbox (Total leads, Hot, Segera Follow Up, Need to Call, Unread/Waiting). Web = charts via
  `recharts`; mobile agent = essentials only. Lead score stays hidden (counts + Interest chips).
  Current dashboard is basic (stats + tables, no charts) → needs this overhaul.
- **Campaign isolation (BR-40/41/42) — HARD RULE, enforce at query layer:** campaign is the
  access-scope unit. Agent + manager are bound to specific campaign(s) (`campaign_agents`),
  never crossing campaigns. A manager must NOT see ANY other campaign's data — leads, contacts,
  templates, activity, reports, dashboard counts. Only admin/owner are org-wide. Each campaign
  is bound to a channel (`campaigns.channel_id` — **planned field, not in schema yet**; add it);
  different campaigns can use different channels. Audit any list/report endpoint to filter by
  the caller's campaigns (current BR-20 guard is per-conversation; this widens it to ALL data).
- **Ads Report (FR-31)** = its own sub-menu: Meta Ads metrics joined down to follow-up +
  conversion (CPL/CPA/ROAS, rank creative by downstream conversion). Dashboard = Overview +
  Campaign Performance (conversion) + Ads Report subs.
- **Design north star (07, updated):** EVERY screen must be unique, premium, enterprise — NOT a
  generic template. Refined CRISP corners, no over-rounding (owner dislikes pill/rounded boxes);
  references Linear / Stripe / Vercel / Superhuman. WS#11 = redesign all web screens to this bar.
  (Components migrated this session are functional baselines; the design pass tightens them.)
- **Mobile = full Flutter rebuild (FR-32, WS#13):** `mobile/` is currently a **v1 copy** — tear
  down + rebuild to match v2 (UI/UX, features, API, RBAC + campaign isolation, no-"AI" wording).
  iOS+Android Flutter, premium unique design, agent-first essentials.
- **Aggressive notifications (FR-33, WS#14, BR-43):** mobile push must be "galak" + survive
  Android battery optimization (high-prio FCM data, full-screen intent, ignore-battery-opt, OEM
  whitelist, re-alert on unactioned urgent leads; iOS time-sensitive/critical). No missed lead.
  Web stays in-app. NOTE: `mobile/` rebuild + push are NOT started yet.
- **Lost Analysis & Junk Detection (FR-34, BR-44, part of WS#1):** auto-set `lost` vs `spam` +
  fill `lost_reason` (rich enum incl. `bought_other_brand`/`bought_used_car`/`out_of_area`...
  + `did_purchase` flag), quarantine (never delete), confidence-gated, never overrides human.
  DONE this session (rules layer, Docker-tested): `classifier.detect_junk()` +
  `classifier.LOST_REASONS` (18-value enum) — high-precision detection of off_topic→`job_seeker`,
  abusive→`abusive`, links/repeated-blast→`spam_junk`; genuine leads pass through. Pure function,
  NOT yet wired (no behavior change yet). NOT yet (wiring = next step): orchestrator auto-set
  `disposition=spam|lost` + `lost_reason` + `did_purchase` (needs migration: seed a `spam`
  disposition + add `conversations.did_purchase` + maybe a `lost_reason` enum check); time-based
  ghost/non-responder (at the follow-up cron); structured LLM `lost_reason` (Simpuler picks from
  the enum); quarantine UX (Lost/Low-Quality tab); junk-rate-per-ad (FR-31). Feeds CatBoost
  (junk = strong negative) + dashboard lost analysis.
- **Lost/Spam reason UI — DONE this session (tsc clean):** replaced the free-text MUI dialog
  with structured Tailwind `inbox/components/LostReasonDialog.tsx` — grouped enum (Lost: bought /
  didn't-buy / **Spam** group), button = **"Mark as Spam"** (user wording, not "junk").
  "Mark as Spam" sets `disposition=spam` (found via `dispositions.category==='spam'`); lost
  reasons set the Lost stage + `lost_reason`. `did_purchase` is DERIVED from the group (bought-*
  => true), no column needed. Needs **migration `0028_spam_disposition.sql`** (seeds the `spam`
  disposition for every org; validated via ROLLBACK) — until applied, "Mark as Spam" degrades
  to saving the reason + a warning. Apply with `make dev`. Display still shows raw enum value
  (prettify label later). Lost-reason display lives in DetailsPanel.
- **FR-34 auto-quarantine — WIRED in `orchestrator.classify_and_update` (py_compile + logic
  tested):** every inbound runs `detect_junk`; if confident (≥`JUNK_CONF`=0.7) it sets
  `interest=cold` + `disposition=spam` (system_key `spam`, from migration 0028) + `lost_reason`,
  COALESCE-safe (never overrides a human-set disposition/lost_reason) and reversible; the LLM
  gate also skips junk (`skipped: junk`, saves tokens). `did_purchase` derived from the enum
  group. **Ghost/non-responder rule DONE** (`handle_followup`, py_compile green): after
  `GHOST_FOLLOWUPS`=2 follow-ups with 0 genuine customer replies → `disposition=spam` +
  `lost_reason='ghosted'` + `interest=cold` + stops the bot (`is_bot_active=false`), COALESCE-safe
  + reversible. STILL TODO: **quarantine filter UX** (Lost/Spam tab so junk leaves the active
  list); **junk-rate-per-ad** (FR-31, needs the ads report). **Structured LLM `lost_reason` DONE**
  — `llm.py` ANALYZE_INSTRUCTION now constrains Simpuler's `lost_reason` to the lost enum
  (bought_other_brand / out_of_area / price_too_high / …), so the LLM path catches the nuanced
  reasons rules can't. End-to-end check (deploy) = rebuild ai-agent + webhook a junk message,
  confirm `disposition=spam` + `lost_reason` in DB.

**Partially built (2026-06-03):**
- `MultiSelectFilter.tsx`, `ConversationCard.tsx`, `ConversationList.tsx` — built AND
  **migrated MUI → Tailwind + Lucide** (tsc clean). "Segera Follow Up" badge logic aligned
  to Hot/Warm + unread (BR-28: lead_score stays a hidden sort signal, not a visible threshold).
- **Page-transition flicker fix (FR-29) done** — `Shell.tsx` wraps page content in a
  framer-motion keyed fade/slide-in (no new dep). Fixed a build-blocker (`callFirstOnly`
  leftover from the dropped Call-First feature).
- **MUI removal progress: 23 files left** (was 26; the 3 inbox list components done). Shell
  already Tailwind-only is the reference pattern. New Tailwind components live in
  `inbox/components/`.
- **`MessageBubble.tsx` extracted** from `inbox/page.tsx` (Tailwind, tsc clean) — handles
  system/contact/agent/bot bubbles + media + status ticks. Wired into the virtualized
  timeline in `page.tsx`. Fixed branding: bot label "AI Agent" → **Simpuler** (Sparkles icon).
- **`Composer.tsx` extracted** ✅ (Tailwind, tsc clean) — textarea + Reply/Internal-note tabs +
  emoji + attach + quick-replies + send. `showQR`/emoji state moved local to the component;
  parent passes `draft/setDraft, tab/setTab, quickReplies, pendingFile, pendingPreviewUrl,
  fileRef, onFile, cancelSendFile, busy, onSubmit(=submit), notify`. Wired into `page.tsx`.
- **Inbox decomposition — completed (2026-06-03 evening session):**
  - `ChatPanel.tsx` ✅ — extracted (Tailwind, tsc clean): chat header with stage chip +
    advance button + custom dropdown stage menu (no MUI Menu), contact name/phone, status
    chip, resolve/reopen, details toggle + virtualized message list (rowVirtualizer, timeline,
    bodyRef) + Composer wiring + media preview modal (custom, no MUI Dialog) + LostReasonDialog
    wiring. All MUI components replaced: Box→div, Typography→p/span, Chip→span, Menu→custom
    portal dropdown, Tooltip→title, IconButton→button, Dialog→custom modal. MUI icons→Lucide.
  - `DetailsPanel.tsx` ✅ — extracted (Tailwind, tsc clean): contact header + Contact/Notes tabs
    + customer details + lead qualification fields + add-note (parent passes `onAddNote`).
    Branding fix: "AI active" → "Assistant". TODO later: add the Highlights (lead_summary /
    suggested_action) block here.
  - **LEFT panel SWAPPED** ✅ — old MUI single-select filter panel (MUI Select/Collapse/
    FormControl: `filter`, `filterChannel`, `filterInterest`, `filterCampaign`, `sortNewest`,
    `showFilters` + local `shown` useMemo) **replaced** with `<ConversationList/>` which has:
    multi-select checkboxes (Status/Stage/Campaign/Interest via MultiSelectFilter), quick
    toggles (Segera Follow Up / Unread / Needs Reply), sort modes (newest/oldest/priority/
    waiting). Channel filter removed per BR (agent sees own convos). State migrated:
    single string → arrays (`filterStatuses[]`, `filterStages[]`, `filterCampaigns[]`,
    `filterInterests[]`); `sortNewest: boolean` → `sort: SortMode`; local `shown` memo
    deleted (ConversationList filters internally).
  - **Dead code cleaned** ✅ — removed orphan `StatusIcon` (old MUI version), `DetailRow`
    (old MUI version), 35+ unused MUI icon imports, `formatCountdown`. `page.tsx` reduced
    from 741 lines → ~260 lines.
  - **MUI removal: 100% COMPLETE** (2026-06-03). Zero `@mui` imports in any active source
    file. Inbox toast replaced with Tailwind (cn + X icon + auto-dismiss). Only `flow_backup.txt`
    (inactive backup) retains old MUI code.
- Backend changes (gateway, messaging, realtime, migrations) ⬜

**Documents updated this session:**
- [03-product-requirements.md](03-product-requirements.md): FR-19 through FR-29, BR-28–39
- [05-user-flows.md](05-user-flows.md): Flow H–K (Call, Logs, Downloads, WA Flows)
- [07-design-system.md](07-design-system.md): page transitions + known UI/UX debt
- [09-database-design.md](09-database-design.md): planned tables (system_logs, export_jobs,
  call_logs, campaigns.business_type, conversations.custom_fields)
- [18-roadmap.md](18-roadmap.md): expanded to 11 workstreams

## Files of note created/changed this session

- Backend: `gateway/roles.go` (new), `users.go`, `auth.go`, `password_reset.go` (new),
  `mail.go` (new), `api.go` (RBAC guards), `messaging/store.go`+`main.go` (multi-thread),
  `db/migrations/0019_password_reset.sql`, `go.mod` (1.22).
- Web: `app/settings/layout.tsx` (new), `_shared.tsx` (new), 8 new settings route pages
  (general/branding/notifications/people/roles/departments/ai/knowledge/audit) + unwrapped
  campaigns/templates/automation/channels/integrations; `forgot-password/`,
  `reset-password/`; `lib/api.ts`, `lib/types.ts`.
- AI: `ai-agent/orchestrator.py`, `main.py`, `libs/python/.../llm.py`; `scripts/distill_kb.py` (new).
- Lead engine (2026-06-03): `ai-agent/features.py` (new), `lead_score.py` (new),
  `classifier.py` (`is_trivial`), `orchestrator.py` (gating), `libs/python/.../llm.py`
  (analyze/draft_followup), `settings.py` (Sonnet); `scripts/label_conversations.py`,
  `build_features.py`, `train_lead_score.py` (new); `services/ai-agent/{requirements.txt,
  Dockerfile,models/}`; `db/migrations/0026_lead_score.sql` + `0027_efficiency.sql` (new);
  `.env` (`LLM_MODEL`, `EMBED_PROVIDER=openai`).
- **Security hardening (2026-06-03):** `realtime/main.go` (JWT auth), `gateway/main.go`
  (webhook HMAC + rate limit wiring + appSecret field), `gateway/ratelimit.go` (new),
  `messaging/store.go` (advisory lock on getOrCreateConversation + getOrCreateThread).

## Inbox decomposition completion (2026-06-03 evening session)

**Components extracted/wired:** `ChatPanel.tsx` (new), left panel swapped from inline MUI
to `<ConversationList/>`. `page.tsx` rewritten from 741 lines → ~260 lines. Dead code
(StatusIcon, DetailRow, 35+ MUI icon imports) removed. tsc clean, production build verified
(all routes compile).

**Files changed:**
- `web/app/(app)/inbox/components/ChatPanel.tsx` (new) — center panel with chat header +
  custom stage dropdown menu + virtualized messages + media preview modal + LostReasonDialog
  wiring. 100% Tailwind + Lucide, zero MUI.
- `web/app/(app)/inbox/page.tsx` — rewritten to compose `<ConversationList/>` + `<ChatPanel/>`
  + `<DetailsPanel/>`. State migrated: single-select filters → multi-select arrays; local
  `shown` memo deleted; 35+ MUI icon imports removed. Only MUI retained: Snackbar/Alert toast.

**What the next agent should do:**
1. **Deploy Lead Intelligence engine:** `make dev` applies migrations 0026/0027/0028 + deploys
   updated ai-agent image. Then end-to-end webhook burst test (POST /debug/reply at :8000).
2. ~~**Continue WS#2 Premium Inbox:**~~ **Ctrl+F search + Highlights DONE (2026-06-03).**
   Remaining: animated UI polish (micro-interactions, skeleton states).
3. ~~**MUI removal:**~~ **100% DONE (2026-06-03).** Zero `@mui` in active source.
4. ~~**Snackbar toast:**~~ **DONE.** Inbox toast replaced with Tailwind.

## MUI bulk migration + page removals (2026-06-03 evening, continued)

**Pages migrated MUI → Tailwind (zero MUI imports):**
- `dashboard/page.tsx` — metric strip, area chart, funnel, interest level, SLA monitoring,
  agent performance table, lost analysis, campaigns analytics tab. Custom ProgressBar replaces
  LinearProgress. Custom Badge replaces Chip. HTML table replaces MUI Table.
- `contacts/page.tsx` — contact table, search, pagination, avatar, channel/interest badges.
- `broadcasts/page.tsx` — broadcast table, new broadcast dialog (custom modal replaces MUI
  Dialog), toggle buttons, radio, toast (custom, replaces MUI Snackbar).

**Pages REMOVED from UI (backend-only):**
- `/knowledge` — **DELETED.** Knowledge base CRUD is API-only (`/api/knowledge`). No UI
  needed; managed via backend scripts (`scripts/distill_kb.py`).
- `/settings/ai` — **DELETED.** AI agent config is API-only (`/api/ai-agent`). Managed via
  backend deployment (`.env` + `ai-agent` service config).
- `/sequences` (Follow-ups) — **DELETED.** Sequences/drip campaigns are API-only
  (`/api/sequences`). Managed via backend automation.

**Nav cleanup:**
- `Shell.tsx`: removed Follow-ups from sidebar NAV_TOP + PAGE_TITLES.
- `settings/layout.tsx`: removed "AI & Tools" group (AI Agent + Knowledge Base) from
  settings sidebar. Removed unused MUI icon imports (AutoAwesome, MenuBook).

**MUI removal: COMPLETE.** Zero `@mui` imports in any active source file (2026-06-03).
All settings pages + inbox toast migrated to Tailwind + Lucide. Only `flow_backup.txt`
(inactive backup) retains old MUI references.

## WS#2 Premium Inbox features (2026-06-03 evening)

**Ctrl+F in-conversation search (ChatPanel.tsx):**
- Ctrl+F / Cmd+F opens a search bar below the chat header
- Filters timeline items (messages + notes) by substring match (min 2 chars)
- Shows match count + current index (e.g. "3/12")
- ChevronUp/Down to navigate between matches (scrolls virtualizer to match)
- Escape or X to close and clear

**Simpuler Highlights (DetailsPanel.tsx):**
- New "Highlights" section at the top of the Contact tab (before Customer details)
- Shows `lead_summary` card (green border, Sparkles icon) when available
- Shows `suggested_action` card (amber border) with reason text when available
- Fields added to `Conversation` type: `lead_summary`, `suggested_action`,
  `suggested_action_reason`, `suggested_action_confidence`, `lead_score`
- Data populated by the Lead Intelligence engine (migration 0026, not yet deployed)

**UI polish:**
- Search button (magnifier icon) added to chat header next to details toggle for
  discoverability (not everyone knows Ctrl+F)
- `ConversationList.tsx`: removed `as any` cast on `lead_score` in priority sort
  (now properly typed on Conversation)
- Removed green online status dot from ConversationCard avatar (per user request)

**WhatsApp 24-hour window indicator (2026-06-03):**
- `ConversationCard.tsx`: red "24h closed" chip when `last_message_at` is >24h old
  (WhatsApp only). Uses Clock icon + red badge styling.
- `Composer.tsx`: red warning banner "24-hour window closed. Only template messages
  can be sent." above textarea when window expired (Reply tab only, not internal notes).
  New `windowExpired` prop passed from ChatPanel.
- `ChatPanel.tsx`: computes `windowExpired` from active conversation and passes to Composer.

## WS#3 WhatsApp Call Tracking (2026-06-03 evening)

**Call button in Composer:**
- Phone icon added to action row (next to Quick Replies)
- Opens `wa.me/{phone}` in new tab (manual call mode)
- Automatically logs call attempt via `POST /api/conversations/{id}/calls`
- Only shown on Reply tab (not internal notes), only when phone is available
- `phone` and `conversationId` props added to Composer, wired from ChatPanel

**Blinking "Call" indicator on ConversationCard:**
- Blue pulsing "Call" chip when: Hot interest + never called (call_attempts=0/null)
- Per BR-30 in roadmap: nudges agents to call engaged hot leads
- `call_attempts` field added to Conversation type

**Backend:** `POST /api/conversations/{id}/calls` already existed (increments
`call_attempts`, adds to `total_call_duration`). No backend changes needed.

**Media & Attachments (WhatsApp Style):**
- `MessageBubble.tsx` completely rewritten to mimic WhatsApp media bubbles.
- Images have timestamp overlays with a gradient background at the bottom.
- Videos show a central play button overlay and use native video tag.
- Documents display as large cards with specific colors based on file extension (PDF=red, DOC=blue, XLS=green, etc.) and a download icon.
- `ChatPanel.tsx` `MediaPreview` modal updated to use a solid dark background (`bg-[#0B141A]/95`) with top-right actions (Download, Close).

**Gateway SQL update:**
- `GET /api/conversations` now SELECTs: `lead_summary`, `suggested_action`,
  `suggested_action_reason`, `suggested_action_confidence`, `lead_score`,
  `call_attempts` -- previously missing from the query, so frontend never received them.
