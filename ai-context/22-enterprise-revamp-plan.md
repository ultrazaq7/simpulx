# 22 — Enterprise CRM Revamp Plan (living document)

> Execution plan + progress tracker for the enterprise revamp batch (approved 2026-07-03).
> **Any agent/session picking this up: read this file first, check the Progress Checklist,
> and update it after every phase (not just in session memory).**

## Goal

Simpulx v2 is inbox-first today. This batch turns it into a full enterprise CRM:

1. Finish the half-done chat-list tile redesign (web + mobile).
2. One reusable right-side drawer (SidePanel) used by ALL filters/forms/wizards app-wide, with strict LIFO Esc-close behavior.
3. Contacts as an action hub: bulk Send Template (initiate chat), bulk Change Stage / Interest / Assign Agent (must work for manual leads with no conversation), Create Deal, Create Ticket (stub).
4. New Deals module, full (DB + API + list view + kanban board). Tickets = next batch (stubs only).
5. New IA: `/home` landing + `/reports` with a LEFT secondary sidebar (General Report / Agent Performance / Ads Performance). Old `/dashboard` redirects.
6. Enterprise Org Setup replacing Settings > General: Organization page (Company Info + Localization + Account Owner + transfer ownership) and Subscription page (Package + Quota usage tabs, real usage counts). No Invoices tab yet.
7. Mobile bottom nav: Chats, Contacts, Reports, Settings; Reports hub with General / Agent Performance / Ads Performance.
8. Icon overhaul to Phosphor (web `@phosphor-icons/react`, mobile `phosphor_flutter`).

## Locked decisions

- Reports sub-nav: LEFT secondary sidebar inside the page.
- Deals first and full; Tickets next batch (visible as disabled "coming soon" stubs).
- Drawer conversions: ALL pages in this batch. Exceptions that stay as-is: small confirm dialogs, one-click menus (sort, row actions, selects), CommandPalette, media viewers.
- Esc must close every closable overlay, strictly LIFO (topmost first), bug-free (see Phase 2 spec).
- Manual leads: stage/interest/agent become editable via contact-level fallback columns (option A; NO shell conversations).
- Subscription: real minimal backend; quota types Users, Simpuler credits, Custom fields. Never use the word "AI" in UI copy (brand rule); UI copy is English, no em dashes.
- Icon set: Phosphor.

## Environment rules

- Repo root: `c:\Users\Fachmi Razaq\Documents\Simpulx`. Backend builds are **Docker only** (`docker compose build gateway messaging && docker compose up -d`; psql via `docker exec`). Do not batch builds with edits.
- Next free migrations: ~~0078 (contact lead fields, DONE)~~, **0079** (deals), **0080** (org subscription).
- **CRITICAL: migrations run through goose.** Every `db/migrations/NNNN_*.sql` MUST start with `-- +goose Up` and include a `-- +goose Down` section, or goose fails to parse it and the ENTIRE deploy aborts at the migrate step (`$DC run --rm -e MIGRATE_ONLY=true gateway`) - builds still pass, only deploy fails. Complex statements (DO blocks / functions) need `-- +goose StatementBegin/End`. This bit 0078 and blocked all deploys until fixed in ca1f0a8.
- Web: Next.js 14.2 App Router, Tailwind **3.4 (do not upgrade to v4)**, recharts, fetch client `web/lib/api.ts`. `components/ui/*` is a dead parallel kit — do not build on it.
- Mobile: Flutter + Riverpod + go_router + dio. Prod APK: `flutter build apk --flavor prod --dart-define=FLAVOR=prod --release`.
- go.mod must stay go 1.22+ (method-prefixed routes 404 otherwise).
- Permission changes must land in 3 places at once: `services/gateway/permissions.go`, `web/lib/permissions.ts`, roles settings matrix UI.
- Design system: `ai-context/07-design-system.md` — crisp corners (not pill), no per-page title blocks (title lives in Shell top bar), brand #2D8B73 / amber #F5A623, use `web/components/Select.tsx` for dropdowns.

## Progress checklist

| Phase | Status | Notes |
|---|---|---|
| 0. This handoff doc | DONE | Keep updated every phase |
| 1. Chat-list tile redesign (web+mobile) | DONE | Session badge counts UP from 0 (elapsed since last_message_at); green ribbon flush-right + rounded-left; chip icon = responder (headset/robot) only when outbound, else no icon; red "24H" badge + date once >24h; delivery ticks sent/delivered/read/failed via new last_outbound_status; agent+campaign as icon+text (Building2), right-aligned. Gateway now selects last_sender_type + last_outbound_status. |
| 2. SidePanel + useEscClose + first conversions | DONE | web/lib/useEscClose.ts (LIFO stack) + web/components/SidePanel.tsx (right drawer). Converted: inbox filters -> FiltersDrawer.tsx, roles create-role, people invite/edit. FilterPopover.tsx kept only for its type exports. |
| 3. SidePanel rollout (all remaining surfaces) | DONE | Converted to SidePanel: channel wizards (shared WizardModal), campaign wizard, custom-fields form, people invite/edit, roles create-role, inbox TemplateWizard, broadcast + drip compose. EXCEPTION: HSM template builder (settings/templates) stays a centered modal (wide 2-col + live phone preview) but gets useEscClose. Contacts ContactModal/ChatPopup deferred to Phase 6 (full revamp). Global scrollbar reworked: hidden by default, reveal+widen on hover, app-wide, theme-aware. INBOX per owner: kept FilterPopover (not drawer) + added toggles Unresponded chat / Last message by customer / Last message by bot; new gateway field customer_responded (EXISTS genuine inbound). |
| 4. Backend contact lead fields + bulk update | DONE | Migration 0078 adds contacts.stage_id/interest_level/assigned_agent_id. List query COALESCEs conversation-over-contact; agent scope falls back to contact owner. New applyContactLead helper (services/gateway/contacts_bulk.go) routes to conversation (classification_locked + events) if one exists, else contact columns. PATCH /api/contacts/{id} accepts the 3 fields; POST /api/contacts/bulk-update (gate edit_contacts, assign gated owner/admin/manager). web api.ts bulkUpdateContacts(). UI wiring in Phase 6. |
| 5. Send Template / initiate chat | DONE | events.go TemplateOutbound; messaging sendTemplateParams + onOutbound Template case; POST /api/contacts/send-template (perm initiate_chats mirrored in permissions.go + web/lib/permissions.ts + roles matrix); web SendTemplateDrawer + api.sendTemplateToContacts. NOTE: rebuild gateway+messaging together (shared events lib). SendTemplateDrawer wiring into contacts SelectionBar happens in Phase 6. Also this batch: Esc-close hasOpenOverlay() guard + inbox menus on the stack; interest "Unset"; contact-detail reuses StageMenu+InterestMenu; DetailsPanel name links to contact; fmtDateTimeShort app-wide; funnel % removed; testing icon FlaskRound; close-conversation picker matches StageMenu. |
| 6. Contacts page revamp | TODO | needs 2+4+5 |
| 7. Deals backend | TODO | migration 0079 |
| 8. Deals web UI (list+kanban, dnd-kit) | TODO | needs 2+7 |
| 9. Web IA /home + /reports | TODO | |
| 10. Org Setup (Organization + Subscription) | TODO | migration 0080 |
| 11. Mobile restructure (nav + reports hub) | TODO | |
| 12. Icons to Phosphor (web+mobile) | TODO | |
| Final: update ai-context 07/19/20 | TODO | |

---

## Phase 1 — Chat-list tile redesign (web + mobile)

Web (uncommitted work already in tree: `web/app/(app)/inbox/components/WindowTime.tsx` and `web/lib/utils.ts` `windowState()` show date-only `MM/dd/yyyy`):
- `WindowTime.tsx`: add exported `WindowCountdownBadge` — solid blue pill (rounded-full, blue bg, white text, 12px clock icon + `Xh Ym Zs`, 1s tick; renders null once the 24h window is closed). Reuse `windowState()`; extend its return with `remainingMs` if needed.
- `ConversationCard.tsx`: mount badge `absolute top-1.5 right-2` (root is already `relative`; give line 1 room so badge and date do not collide). Last-responder icon left of the date: `last_message_direction === "agent" && !is_bot_active` -> Headset; `=== "agent" && is_bot_active` -> robot/Bot; `=== "contact"` -> none (both fields exist on `Conversation` in `web/lib/types.ts`). Remove CLOSED/SNOOZED text badges from line 1; right side of line 2: closed -> CheckCircle muted, snoozed -> Clock amber, else keep needsCall/needsFollowUp icons.

Mobile:
- `mobile/lib/core/utils/time_format.dart`: `formatSessionTimestamp` -> `MM/dd/yyyy` (drop time).
- `mobile/lib/features/chat/presentation/widgets/conversation_tile.dart`: wrap tile in `Stack` + `Positioned(top,right)` solid-blue countdown badge (move `_WindowTime` timer logic into a `_CountdownBadge`); `_WindowTime` becomes a static date; responder icon (headset_mic / smart_toy) left of the date; `_StatusChip` closed/snoozed -> small icons matching web.

Verify: `npm run build`; `flutter analyze`; manual: countdown ticks, badge disappears after 24h (fake via psql `last_message_at`), icon flips agent/bot, closed/snoozed rows show icons not text.

## Phase 2 — SidePanel primitive + Esc-close app-wide + first conversions

- New `web/lib/useEscClose.ts` — `useEscClose(open, onClose)` with a strict LIFO overlay stack: module-level registry (array); register when `open` becomes true, unregister on close/unmount (mandatory effect cleanup, no zombie entries). ONE global `keydown` listener (not per overlay) that calls `onClose` of the TOP entry only + `stopPropagation`, so close order is always the reverse of open order (drawer -> dropdown inside it -> confirm on top: Esc closes confirm, then dropdown, then drawer). Bug guards: (1) ignore Esc during IME composition (`e.isComposing`); (2) Esc inside input/textarea still closes the top overlay UNLESS an element handles it itself (open native `<select>`, custom dropdown registered as an overlay); (3) re-render must not double-register (key by id/ref); (4) StrictMode double-mount safe.
- Esc-close sweep requirement: everything closable closes on Esc — SidePanel, confirm dialogs, popover menus (sort/filter/row-actions/search-mode/notifications/user menu), CommandPalette, media viewer, ChatPopup, any remaining hand-rolled `fixed inset-0`. Apply `useEscClose` while converting each surface in Phases 2-3; sweep the non-converted ones in Phase 3. Mobile needs nothing (Android back button already dismisses sheets/dialogs).
- New `web/components/SidePanel.tsx` (standalone; NOT on `components/ui/*`). Portal, `fixed inset-0 z-50`, backdrop `bg-black/40` click-close, right panel `inset-y-0 right-0 bg-card border-l shadow-xl flex flex-col`, slide-in transform, Esc via `useEscClose`, body scroll lock. Header (title + description + X, border-b), scrollable body, sticky footer (Reset left; Cancel + Apply brand right). Props: `{open, onClose, title, description?, width?: "sm"|"md"|"lg" (400/480/640), children, footer?, onApply?, applyLabel?, applyDisabled?, onReset?, busy?}` — multi-step wizards pass custom `footer`.
- Proof conversions: inbox `FilterPopover.tsx` -> SidePanel "Filters"; roles create/edit modal (`settings/roles/page.tsx`); people invite/edit dialog (`settings/people/page.tsx`).

## Phase 3 — SidePanel rollout (remaining surfaces, container-only)

ChannelWizard/WebApiWizard/AdWizard (`settings/channels/`), CampaignWizard (`settings/campaigns/`), templates form, custom-fields form, broadcasts + drip compose, inbox TemplateWizard. Exceptions stay: confirm delete/blacklist, sort/row-action menus, `Select.tsx`, CommandPalette, media viewer.

Verify (2-3): web build + click through every flow (create channel/campaign/template, compose broadcast); test Esc on every overlay including stacking (drawer + confirm on top) and confirm Esc does not fight focused inputs inside a drawer (Esc with an open dropdown closes the dropdown first, not the drawer).

## Phase 4 — Backend: contact lead fields + bulk update

- Migration `db/migrations/0078_contact_lead_fields.sql`: `ALTER TABLE contacts ADD stage_id uuid REFERENCES stages(id) ON DELETE SET NULL, interest_level varchar(20), assigned_agent_id uuid REFERENCES users(id) ON DELETE SET NULL` + index on assigned_agent_id.
- `services/gateway/api.go`:
  - `handleListContacts` (~:1655) & contact detail: `COALESCE(lc.x, ct.x)` for stage/interest/agent; agent scope filter uses the COALESCEd agent id; leave `managerScope` branch term conversation-only.
  - `handleUpdateContact` (~:1750): accept `stage_id/interest_level/assigned_agent_id` — if the contact has a latest conversation, update through the PATCH-conversation path (sets `classification_locked`, logs `conversation_events`); else write the contact fallback columns.
  - New `POST /api/contacts/bulk-update` (gate `edit_contacts`): `{contact_ids[], set:{stage_id?, interest_level?, assigned_agent_id?, add_tags?, remove_tags?, blacklisted?}}` -> `{updated, skipped[]}`. Assign field enforces owner/admin/manager (mirror single assign). Org-ownership check per id.
- `web/lib/api.ts`: `bulkUpdateContacts()`.

Verify: docker compose build gateway; psql `\d contacts`; PATCH manual contact -> contact columns; PATCH contact with conversation -> conversation + event row; mixed bulk; agent scoping still correct.

## Phase 5 — Send Template / initiate chat (backend + web)

- `libs/go/events/events.go`: add `Template *TemplateOutbound` to `MessageOutbound` (`{name, language, body_params[], header_type?, header_media_url?, header_param?}`).
- `services/messaging/whatsapp_sender.go`: new `sendTemplateParams(...)` (Meta components array); refactor `sendTemplate` (:46) to delegate with empty params (automations.go:461 untouched).
- `services/messaging/main.go` `onOutbound` (~:219): case `e.Template != nil` -> sendTemplateParams BEFORE the existing type switch; conversation resolution via `ContactID+ChannelID` already works (`getOrCreateConversation`); persist type="template", body = rendered preview.
- New gateway `POST /api/contacts/send-template` (`services/gateway/initiate.go`, new perm **`initiate_chats`**): `{contact_ids[], channel_id, template_id, variables[]}` -> validate template APPROVED + variable count vs `{{n}}`; skip (with reason) contacts without phone / blacklisted; publish `MessageOutbound{ContactID, ChannelID, SenderType:"agent", Type:"template", Body:rendered, Template:...}` (copy publish pattern api.go:~1402). Response `{queued, skipped[]}`.
- Permission mirroring in all 3 places (agent default: true).
- Web: `web/app/(app)/contacts/components/SendTemplateDrawer.tsx` (SidePanel md: channel -> APPROVED template -> variables + preview bubble -> Send). `api.ts`: `sendTemplateToContacts()`.

Verify: rebuild gateway+messaging TOGETHER (shared events lib); mock sender -> psql: new conversation + message type=template; skipped list correct; 403 without perm.

## Phase 6 — Contacts page revamp (web)

Split `web/app/(app)/contacts/page.tsx` (~820 lines) into `web/app/(app)/contacts/components/`:
- `ContactsTable.tsx` — uppercase 10px tracking column headers, row hover, slim padding; keep inline StageMenu/Interest/AgentAssignCell (they now hit the Phase-4 PATCH, so manual leads are editable too).
- `SelectionBar.tsx` — appears when N selected: `N selected | Send Template | Change Stage | Change Interest | Assign Agent | Add Label | Create Deal | Create Ticket (disabled "coming soon") | Blacklist | Delete | Clear`. Stage/Interest/Agent -> bulk-update; Send Template -> Phase 5 drawer; Create Deal -> Phase 8 drawer (disabled until Phase 8; enable when exactly 1 contact selected).
- `FiltersDrawer.tsx`, `ContactDrawer.tsx` (replaces centered ContactModal; adds stage/interest/agent fields for manual leads), `PaginationFooter.tsx` ("Rows per page 10 | Showing 1-N of M"; v1 client-side pagination, server `?page/page_size` optional follow-up).

Verify: web build; filter drawer, every bulk action (incl. manual lead), send-template end-to-end, create/edit drawer, pagination, agent scoping.

## Phase 7 — Deals backend

- Migration `db/migrations/0079_deals.sql`:
  - `deal_pipelines` (organization_id, name, is_default; unique partial index one-default-per-org)
  - `deal_stages` (pipeline_id, name, position, probability?, is_won, is_lost)
  - `deals` (deal_number bigserial display id, organization_id, pipeline_id, stage_id, name, amount numeric(18,2), currency default 'IDR', contact_id?, conversation_id?, owner_user_id?, campaign_id?, status open|won|lost CHECK, expected_close_date?, closed_at?, created_by, timestamps) + indexes (org+pipeline+stage, org+status, contact).
  - Seed default "Sales Pipeline" per existing org with stages New -> Qualified -> Advanced -> Payment In Process -> Won(is_won) -> Lost(is_lost).
  - Gateway lazy `ensureDefaultPipeline(orgID)` for orgs created after the migration (without it POST /api/deals fails).
- New `services/gateway/deals.go` (copy patterns from templates.go CRUD + handleListContacts filtering); routes in main.go:
  - GET/POST `/api/deal-pipelines`, PATCH/DELETE `/{id}` (block delete when deals exist), POST `/{id}/stages`, PATCH/DELETE `/api/deal-stages/{id}` (reorder via position)
  - GET `/api/deals` (`?pipeline_id&stage_id&status&owner_user_id&q&page&page_size` -> `{items,total}`, join contact/owner/stage names), POST (defaults: default pipeline + its first stage, owner=caller), PATCH `/{id}` (stage move auto-sets status/closed_at from is_won/is_lost), DELETE.
  - Scoping: agent = own deals only; manager = all org deals (v1); owner/admin = all.
- New permission keys in all 3 places: `menu_deals`, `view_deals`, `manage_deals` (agent default true; writes stay row-scoped).

Verify: build gateway; psql seed; curl CRUD round-trip; move to Won -> status/closed_at; 403 + scoping.

## Phase 8 — Deals web UI (list + kanban)

- `npm i @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities` in web/.
- `web/app/(app)/deals/page.tsx`: toolbar = pipeline Select + search + "All filters" (FiltersDrawer) + list/board toggle icons + "New deal". Components in `web/app/(app)/deals/components/`:
  - `DealBoard.tsx` — DndContext sensors: PointerSensor `{distance:4}` + TouchSensor `{delay:200, tolerance:8}` (load-bearing for tablet scroll) + KeyboardSensor; useDroppable column per stage, useSortable cards, DragOverlay ghost; column header = name + count + sum(amount), Won/Lost tinted; onDragEnd optimistic PATCH + rollback toast.
  - `DealCard.tsx` (name, #deal_number, amount, contact, owner avatar), `DealList.tsx` (Deal Name, Deal ID, Stage, Amount/Date, Actions menu Edit/Delete + pagination footer), `DealDrawer.tsx` (SidePanel; searchable contact picker), `FiltersDrawer.tsx`.
- `web/lib/types.ts` + `api.ts`: Deal/Pipeline/Stage types + endpoints.
- `web/components/Shell.tsx`: NAV_TOP + `/deals` (perm `menu_deals`), PAGE_TITLES, CATEGORY_ICONS, CommandPalette entry.
- Contacts SelectionBar: enable Create Deal (prefill contact).

Verify: web build; drag with mouse + touch emulation; view toggle preserves filters; nav hidden without perm.

## Phase 9 — Web IA: /home + /reports

- New `web/app/(app)/home/page.tsx`: "Welcome back, {name}" + quick-action cards (Create campaign, Add contact, Open inbox, Create deal, Open reports) + live stat tiles from `api.getDashboardCards()`.
- New `web/app/(app)/reports/layout.tsx` (left secondary sidebar ~200px: REPORTS > General Report / Agent Performance / Ads Performance) + `page.tsx` redirect to `/reports/general`. Split `dashboard/page.tsx` (~1200 lines) into `reports/{general,agents,ads}/page.tsx` + shared `reports/components/` (OverviewChart, funnels, lost analysis, PerfTables, MarketingAnalytics/IndonesiaMap/BreakdownDonut). General stays role-aware (agent action cards); Ads uses existing `GET /api/ad-performance`.
- `/dashboard` -> client redirect `/reports/general`. Root redirect + login redirect + Shell logo link -> `/home`. NAV_TOP order: Home, Inbox, Contacts, Deals, Broadcasts, Drip, Reports; Home has no perm (missing perm = allowed); Reports keeps key `menu_dashboard` (relabel "Reports" in roles UI). Update PAGE_TITLES, keyboard shortcuts (`d` -> /reports, `h` -> /home), CommandPalette.

Verify: /dashboard redirects; login lands on /home; all three report pages render; agent role correct.

## Phase 10 — Enterprise Org Setup (replaces Settings > General)

- Migration `db/migrations/0080_org_subscription.sql`: `org_subscriptions` (organization_id PK REF, package_name default, status active|trial|expired, renewal_date, quotas jsonb `{"users":N,"simpuler_credits":N,"custom_fields":N}`, timestamps) + seed existing orgs.
- New `services/gateway/subscription.go`:
  - GET `/api/subscription` (gate `view_settings`): package + rows `[{key,label,limit,used,remaining}]`; used computed real: active users count, Simpuler credits = bot replies this month (reuse ai_replies query from handleStats), custom fields count.
  - PATCH `/api/subscription` (owner only): package_name/renewal_date/quotas.
  - GET `/api/subscription/usage?type&from&to`: daily counts for the Quota usage chart.
- Transfer ownership: `POST /api/users/{id}/transfer-ownership` (owner only, single tx: target -> owner, caller -> admin) in `users.go`.
- Web: new `settings/organization/page.tsx` — Company Info card (name, phone, email, address, industry, company size -> `organizations.settings` JSONB; edit via SidePanel), Localization card (moved from General), Account Owner section (+ Transfer ownership with confirm dialog). New `settings/subscription/page.tsx` — tabs: Package (package card + Active badge + renewal date + quota table Quota type / Limit / Used / Remaining) and Quota usage (quota type Select + period + recharts line chart + Export CSV). `settings/general` -> redirect to organization; update settings layout nav.
- UI copy: "Simpuler credits" (never "AI").

Verify: build gateway + web; psql seed; GET subscription returns real used counts; transfer-ownership tx correct; General redirects.

## Phase 11 — Mobile restructure

- `mobile/lib/app/router/app_router.dart`: `/dashboard` -> `/reports` (+ redirect for the old path), reorder branches Chats, Contacts, Reports, Settings; `mobile/lib/app/shell/app_shell.dart` destinations; `mobile/lib/app/app.dart` `_navigateToRoute` shell set; l10n `app_en.arb`/`app_id.arb` add `navReports` ("Reports"/"Laporan") + regen.
- New `mobile/lib/features/reports/`: `reports_hub_page.dart` (pattern: `workspace_hub_page.dart`) -> General (reuse dashboard cards + funnel/response/lost; promote the private `_Card` from dashboard_page.dart to `core/widgets/`), Agent Performance (existing `_LeaderboardCard` as its own page), Ads Performance (NEW: wire `ApiEndpoints.adPerformance` — defined but unused — model + datasource + provider mirroring `features/dashboard/data`; UI = per-campaign cards spend/leads/CPL).

Verify: `flutter analyze`; emulator run: tab order, redirect, ads loads.

## Phase 12 — Icons to Phosphor (full sweep, compile-safe steps)

- Web `npm i @phosphor-icons/react` (lucide coexists during migration): (1) Shell + CommandPalette (House, ChatCircle, Users, Handshake, Megaphone, ArrowsClockwise, ChartBar, Gear; active nav `weight="fill"|"duotone"`; keep 16-22px sizing); (2) settings sidebar + pages; (3) inbox (Headset, Robot, CheckCircle, Clock from Phase 1); (4) contacts/deals/reports/home/broadcasts/drip; (5) `npm remove lucide-react` + grep guard (`from "lucide-react"` must return nothing). Build each step.
- Mobile: `phosphor_flutter` in pubspec; nav icons in `app_shell.dart` first, then main screens; Material icons may remain in low-traffic screens (opportunistic sweep).

---

## Order & parallelism

1 -> 2 -> 3 (web UI track) while 4 -> 5 (backend track) run independently -> 6 (needs 2+4+5) -> 7 -> 8 (needs 2+7) -> 9 -> 10 -> 11 -> 12. Every phase leaves the app compiling and shippable.

## Risk notes

- Permission mirroring in 3 places (permissions.go + web/lib/permissions.ts + roles matrix UI) — Phases 5/7/9 all touch it; checklist item per phase.
- Shared events lib change (Phase 5): gateway AND messaging must rebuild/deploy together; the `Template != nil` case must win before the type switch.
- managerScope after COALESCE (Phase 4): explicitly test agent and manager listings.
- Template send needs an APPROVED template on a real WABA; the mock sender hides Meta component-format errors (error 132000) — validate variable count server-side.
- dnd-kit touch: TouchSensor 200ms delay is mandatory or board scroll breaks on tablets.
- Bulk assign must enforce the same roles as single assign (owner/admin/manager).
- /dashboard deep links: web redirect + mobile redirect + CommandPalette + keyboard map + shot.mjs.
- ensureDefaultPipeline for post-migration orgs — without it POST /api/deals fails.
- go.mod must stay go 1.22+.
