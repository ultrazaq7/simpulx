# 07 — Design System

The single source of truth is **`globals.css`** (CSS variables) + **`tailwind.config.ts`**.
All styling uses **Tailwind CSS only**. MUI was used historically but is being fully
removed (see migration section below). **Do not add any new MUI imports.**

## Design north star (WAJIB — applies to EVERY screen, web + mobile)

This is a flagship **enterprise** product, not a CRUD template. Every screen must look like it
was designed by a top-tier product designer and have its own identity. The bar / references:
**Linear** (crisp, fast, keyboard-first), **Stripe Dashboard** (data density + clarity),
**Superhuman** (speed + premium feel), **Attio / Retool** (enterprise CRM), **Vercel** (minimal
sharpness), **Arc** (delight). Explicitly AVOID the generic "AI-made template" look:
- **No cookie-cutter card grids, no flat-gray-everything, no default component look.** If a
  screen could pass for a stock admin template, it's wrong — redesign it.
- **Refined, engineered corners — NOT pill-rounded.** The owner specifically dislikes
  over-rounded boxes. Keep corners crisp (see Shape & elevation). Circles only for
  avatars/status dots.
- Intentional **typography hierarchy**, tight-but-breathable spacing, real **data density**.
- Depth via **borders + subtle shadows + layering + motion**, not rounding. Brand `#2D8B73`
  used with **gradients/accents**, not flat fills.
- Purposeful **micro-interactions** (hover, press, skeleton, transitions) on every surface.
- Every screen gets a design pass (WS#11). No screen ships on raw MUI/Tailwind defaults.

## Direction shift → "SleekFlow with our colors" (2026-06-04, owner)

Owner shared **SleekFlow** (app.sleekflow.io) as the reference and asked to match its *style/
structure* but keep Simpulx colors, "so it looks handcrafted by a human." **This SOFTENS the
earlier crisp/anti-rounding "Linear" north star** — go softer, rounder, airier, more whitespace,
pill chips, light-green selection (green replaces SleekFlow's blue). Patterns being adopted:
- **Spacious top bar:** category label + bold title (left), global **Cmd/Ctrl+K** search (center),
  action cluster — notifications + avatar+name+chevron (right). (Skip SleekFlow's Book-a-demo/Upgrade.)
- Right details rail = **Labels + Lists** (our `tags` become "Labels": chips + X + add).
- **Tabs** for sub-nav (List/Kanban, Activity/Associations/Remarks/Media, Profile/System preference).
- Sortable table columns; full-page **Contact detail** (3-col + activity timeline = FR-27).

**DONE (Shell-first proof, verified tsc+build):** softened `--radius` 0.5rem→0.625rem (propagates
to every card/input/button/modal); rebuilt `Shell.tsx` top bar SleekFlow-style (h-16, category+
title, Cmd+K search pill, notif, avatar+chevron); added a real **Cmd+K command palette**
(`CommandPalette` in Shell — nav targets, arrow/enter/esc keys).
**Inbox soft pass DONE (verified):** chips/labels pill-ified (`rounded-full`), lifecycle stage =
pill, and the **Labels rail** landed — `DetailsPanel` has an editable **Labels** section (the
contact's `tags`, add/remove inline → `api.updateContact`), conversation cards show label pills.
Backend: `/api/conversations` now returns `contact_id` + `tags`. (Contacts = **List only, no
Kanban** per owner.)

**Tuning (2026-06-04, owner feedback on SleekFlow screenshots):**
- **Cmd+K REMOVED** — owner disliked it; the command palette + search pill are gone from Shell.
- **Colors softened** ("tajem banget, soft di mata"): `--foreground` 222/47/11 → 218/33/18,
  `--muted-foreground` → 218/12/52, `--background` → 213/30/98, `--border`/`--input` softened.
  Lower contrast / navy-tinted, gentler on the eyes. Brand green kept.
- **Sidebar scaffold = SleekFlow:** active nav item is now a **filled white rounded-square with
  the brand-green icon** (dropped the left accent bar); inactive icons muted.
- Active conversation card highlight nudged for clarity.
- **Unified dropdown:** new reusable **`components/Select.tsx`** — a polished, **searchable**
  single-select (search box on top auto-shown when >6 options, brand-green focus ring + selected
  highlight, soft). **All 22 native `<select>` across 9 files replaced** (campaigns, contacts,
  broadcasts + detail, integrations, people, templates, automation + flow). Use this for any new
  dropdown instead of native `<select>`.

**STILL TODO (SleekFlow feature-panels owner pointed at):** consolidated **filter dropdown**
(Channels/Labels/Lifecycle/Unread/Clear all in one panel), conversation-card **"..." menu**
(Pin/Mark-unread/Close/Snooze — Pin+Snooze need backend cols), right-rail **icon tabs +
Media/Document** sections, and the inbox **left flyout nav** (My Inbox/Collaborations/Mentions/
Lifecycle-stage quick filters/Company inbox). **NEXT page surfaces:** Contacts (soft + Contact
detail page FR-27), Settings (Profile/System tabs), Broadcasts.

## Overhaul status + foundation decision (2026-06-04)

Owner kicked off the full enterprise overhaul: **direction = "total radikal"** (free to redefine
palette/layout incl. shell/nav, within Simpulx green+amber), **flagship-first = Inbox**.

**Foundation decision (LOCKED): stay on Tailwind v3.4. Do NOT migrate to v4.** A stalled
parallel-frontend kit landed in `web/components/ui/*` (base-ui + shadcn) written for **Tailwind
v4** (`ring-3`, `rounded-4xl`, `has-data-*`, `oklch color-mix`) — on v3.4 many of those classes
silently never generate, which is why login/inbox looked subtly broken. Rule: when a v4-era
primitive is touched, normalize it to clean v3 (no inventing v4 utilities).

**Token system = single source of truth**, both files now wired together:
- `web/app/globals.css` — semantic tokens `--success/--warning/--info/--amber`, dark-rail
  `--sidebar*`, premium thin scrollbar, `.skeleton` shimmer (replaces dumb pulse), Inter
  `font-feature-settings`, brand-tinted `::selection`.
- `web/tailwind.config.js` — colors (primary.light/dark, amber, success/warning/info, sidebar),
  enterprise shadow ramp (`shadow-xs..2xl` + `brand-md`), `bg-brand-gradient`/`bg-sidebar-gradient`,
  motion keyframes (`animate-fade-in`/`scale-in`/`shimmer`), `font-sans` = Inter.
- Helper: `relTime()` in `lib/utils` — compact non-ticking relative time ("5m"/"2h"/"3d") for
  dense lists.

**DONE this session (verified each step: `tsc --noEmit` clean + `next build` 25 routes):**
1. The entire **Inbox** — `ConversationCard` (full-bleed rows + left accent bar
   [active/follow-up/call] + channel-dot avatar + subtle signal tags, no pulsing chips),
   `ConversationList` (header rail + count/sort strip + clear-all), `MultiSelectFilter`,
   `ChatPanel` (header + stage menu + empty state + timeline), `MessageBubble` (brand/card
   bubbles, audio waveform logic untouched), `Composer` (token + note-mode amber + recording
   UI), `DetailsPanel`, `LostReasonDialog`.
2. **App frame** — `Shell.tsx` (sidebar `bg-sidebar-gradient` + active nav brand accent bar +
   brand-gradient avatar + tokenized topbar/user-menu/notifications), **Login** (rebuilt as a
   split-screen: dark brand panel + clean form, on-brand green button — dropped the generic
   black `bg-slate-900` button + the broken v4 `components/ui` primitives), **forgot-password**
   + **reset-password** (centered premium cards matching login, brand buttons, token inputs).
3. **Dashboard (FR-30) — now ROLE-AWARE** (`dashboard/page.tsx` branches on `getUser().role`):
   - **Agent** → action-center only (no org analytics, no lead score): 5 big clickable cards
     (My open / Hot / Follow up now / Need to call / Unread) → deep-link to filtered inbox, plus
     a personal "last 7 days" chart + interest split. Counts come from a **new backend endpoint
     `GET /api/dashboard/cards`** (`gateway/api.go` `handleDashboardCards`, registered in
     `main.go`) — role-scoped exactly like stats/analytics (agent=own / manager=own campaigns /
     admin=org). Frontend: `api.getDashboardCards()` + `DashboardCards` type.
   - **Manager/Admin** → full analytics (`ManagerDashboard`): the existing
     overview+campaigns tabs. Manager is **already campaign-scoped** in `handleStats`/
     `handleAnalytics` via the `campaign_agents` subquery (BR-40/41/42); admin/owner org-wide.
   - Shared fixes: real `analytics.daily` chart (removed fabricated `generateChartData`, honest
     empty state), **"AI Handled" → "Assisted"** (no-"AI" rule), token `Card` shell,
     `tabular-nums`. Deep-links: `inbox/page.tsx` reads URL params on mount
     (`?interest=hot|warm|cold`, `?status=open`, `?unread=1`, `?followup=1`).
   - **Why role-aware:** an agent ("Agent Satu") was being shown manager-grade org analytics
     (agent performance table, SLA, lost analysis) — wrong audience + cross-campaign data leak.
   - **Deployed + verified live:** `/api/dashboard/cards` returns `{open,hot,follow_up,need_call,
     unread}` (gateway image rebuilt via compose; healthz 200, route 401 without token, authed
     agent1 → `open:1`). Also polished the manager metric strip (value `whitespace-nowrap` so
     "13h 54m" stops wrapping) and `OverviewChart` single-day state (shows the day's Leads/Replied
     numbers instead of a lone floating dot).
4. **Contacts** — token-based rewrite: removed the redundant per-page `<h1>Contacts</h1>` (the
   page name already lives in the Shell topbar — enterprise-clean rule), toolbar with search +
   Export + brand "Add contact", uppercase-muted table headers, channel-dot avatars, crisp `md`
   chips, `.skeleton` shimmer, tokenized pagination. **Buttons are now FUNCTIONAL (no mockup):**
   - **Export** → client-side CSV download of the filtered list (no backend).
   - **Add contact / Edit** → real modal wired to **new backend endpoints** `POST /api/contacts`
     + `PATCH /api/contacts/{id}` (`gateway/api.go` `handleCreateContact`/`handleUpdateContact`,
     tenant-scoped, PATCH has the 404 IDOR guard). Frontend `api.createContact`/`updateContact`.
     Verified live (hot-swap deploy): create returns the row, patch 204, random id → 404.
   - Note: `contacts` only owns `full_name`/`phone`/`source_channel` (manual adds get
     `source_channel='manual'`); interest/stage come from the latest conversation, so they're
     read-only on this page.

5. **Dashboard DATA-ACCURACY overhaul (2026-06-04)** — owner flagged ambiguous/inaccurate
   numbers. Fixed in `gateway/api.go` `handleAnalytics` (deployed + verified live):
   - **Replied** now = AGENT replied (`last_agent_message_at`); added **Engaged** = lead/customer
     replied (`last_contact_message_at`). (Was conflated.)
   - **Won** = reached the FINAL pipeline stage (Booking = max `sort_order`), not `ai_stage`
     (which is unreliable). **Lost** = disposition `category='lost'`.
   - **Response time** excludes bot (`sender_type='agent'`) = true agent first-response.
   - **Real lead funnel** (`funnel_stages`): cumulative "reached this stage or beyond" along the
     pipeline + stage-to-stage conversion %. Replaces the old ai_stage bars.
   - **Lost analysis** now returns `lost` + `lost_reasons` (was missing → always 0).
   - Frontend: single `fmtDuration()` in `lib/utils` used everywhere (no more per-section format
     drift); restored the area `OverviewChart` (dropped the single-day number-box); new
     `LeadFunnel` component; metric strip = Leads/Active/Unassigned/Replied/Won/Avg-first-response;
     agent table columns accurate; removed ambiguous "Strong Intent"/duplicate RT column.
6. **Pipeline + Lost flow fix (2026-06-04)** — SPK + Delivered merged into a single final stage
   **Booking** (migration `0029_booking_stage.sql`, goose, applied live). **Lost was unreachable
   in the UI** (the stage menu only showed Lost if a "lost" STAGE existed, but Lost is a
   DISPOSITION). Fixed: inbox stage menu now has a **Outcome → "Mark as lost / spam"** item that
   opens the reason dialog and sets `disposition` (category lost/spam) + `lost_reason`. Removed
   the dead "lost stage" path. Also removed the low-value "Select all / Clear all" row from the
   inbox `MultiSelectFilter`.

**NEXT surfaces (raw/old styling still):** Broadcasts → Settings (14 routes) → then the dead
parallel `components/ui/*` + `components/inbox/*` v4 kit (normalize to v3 or delete if unused).
Open follow-up: campaigns sub-tab + `handleCampaignAnalytics` still use the old strong/won
definitions. **Agent "Floor" (the WS#E counterpart to the manager Control Tower) is DROPPED** —
owner decided the agent keeps the existing action-center dashboard; do not build a separate
Floor surface.

## Brand

Ported from v1 brand (`app_style.dart`). Green primary, amber accent, near-black ink.

## Color tokens

| Token | Value | Use |
|---|---|---|
| primary.main | `#2D8B73` | Primary actions, links, active state |
| primary.light | `#3AA88D` | Gradients, hover |
| primary.dark | `#236F5D` | Pressed |
| secondary.main | `#F5A623` | Accent (the "x" in Simpul**x**), highlights |
| success.main | `#2D8B73` | Active/connected, won |
| warning.main | `#F59E0B` | Pending, follow-up |
| error.main | `#EF4444` | Destructive, lost |
| info.main | `#0288D1` | Informational |
| background.default | `#F4F8F6` | App canvas |
| background.paper | `#FFFFFF` | Cards, tables, dialogs |
| text.primary | `#0F172A` | Body |
| text.secondary | `#667085` | Labels, meta |
| text.disabled | `#9CA3AF` | Placeholders, empty |
| divider | `rgba(0,0,0,0.08)` | Borders, separators |
| action.selected | `rgba(45,139,115,0.08)` | Selected nav/row |
| Sidebar bg | `#0d1b16` | Dark app rail (Shell) |

**Semantic chip colors** used across pages: role `owner`#7C3AED, `admin`#2563EB,
`manager`#0891B2, `agent`#64748B; status active `#16A34A`; attribution ad `#2563EB`,
keyword `#0D9488`. Status pills won `#15803D`/`#DCFCE7`.

## Typography

- Family: **Inter** (system fallback). Antialiased.
- Scale: h4 24/700, h5 20/700, h6 16/600, subtitle1 15/600, subtitle2 13/600 UPPERCASE
  +0.05em (section labels), body1 14/1.6, body2 13/1.5, caption 11.
- Buttons: `textTransform: none`, weight 600. (Sentence case everywhere — see BR-24, no
  em dashes.)

## Shape & elevation

> **Updated direction (owner):** crisp, engineered corners — NOT pill-rounded. Over-rounding
> reads as a generic template; we want the sharp feel of Linear / Stripe / Vercel.

- **Radius scale:** `6px` (`rounded-md`) default for buttons / inputs / chips / list rows;
  `8-10px` (`rounded-lg`) for cards / dialogs / panels; **`0`** for full-bleed data surfaces
  (table cells, dense rows). **Never** `rounded-xl` / `rounded-2xl` / `rounded-full` on
  containers — circles are reserved for avatars and status dots only.
- Depth comes from **borders + subtle shadows + layering**, not rounding: hairline borders
  (`border-slate-200`), soft shadow ramp `shadow-sm` → `shadow-md` → `shadow-lg`, 1px dividers.
  Contained buttons flat by default, lift to `shadow-md hover:shadow-lg` on hover.
- Custom 6px scrollbars (`#CBD5E1`) in `globals.css`.
- NOTE: components already migrated this session use `rounded-lg` (8px) — fine as a baseline;
  the WS#11 design pass tightens radii + adds depth/identity per the north star above.

## Component conventions (Tailwind-only)

- **Button:** `px-4 py-2 rounded-lg font-semibold text-sm` + brand variants. Sentence case.
- **Card:** `border border-border rounded-lg bg-card` — no shadow by default.
- **Chip/Badge:** `px-2 py-0.5 rounded-md text-xs font-semibold` + semantic bg/fg colors.
- **Input/Select:** `border border-input rounded-lg px-3 py-2 text-sm bg-background` +
  focus ring `focus:ring-2 focus:ring-primary/30`.
- **Table:** `text-xs font-semibold uppercase tracking-wider text-muted-foreground` headers,
  compact cell padding, hairline row borders `border-b border-border`.
- **Dialog/Modal:** `rounded-xl shadow-xl bg-card` + backdrop blur.
- **Tooltip:** `rounded-md shadow-lg text-xs bg-foreground text-background`.

## Layout patterns (settings)

Shared helpers in `web/app/settings/_shared.tsx`:
- `useToast()` → `{ notify, ToastHost }` — the standard Snackbar+Alert.
- `PageBody({ maxWidth })` — standard scroll container + padding.
- `PageHeader({ left, right })` — title-less header row; primary action on the right.
- `SectionLabel`, `ROLES`, `ROLE_COLOR`, `ROLE_PERMS`, `initials`.

## Enterprise-clean rules (product decision)

- **No per-page title + description header blocks.** Pages start directly with content
  (toolbar/table). The page name lives in the nav + browser tab.
- Tables for any list that will grow (People, Campaigns) — paginated (10/25/50), with a
  search field top-left and the primary action top-right.
- Empty states: centered icon + short headline + one-line hint + primary action.
- Honesty: no fake/"coming soon" buttons that only toast (the Facebook connect facade
  was removed). Disabled "coming soon" channel rows are acceptable honest state.

## Icons

**Lucide React** (`lucide-react`) — already used in Shell.tsx. Clean, consistent,
tree-shakeable. Use 16–22px, `text-muted-foreground` unless active.
`@mui/icons-material` must be removed as part of the MUI migration.

## MUI → Tailwind migration (CRITICAL — FR-29)

**27 files** currently import `@mui/material`. ALL must be migrated to Tailwind-only.
Packages to remove after migration: `@mui/material`, `@mui/icons-material`, `@mui/lab`.

Migration mapping:
| MUI Component | Tailwind Replacement |
|---|---|
| `<Box sx={{...}}>` | `<div className="...">` |
| `<Typography>` | `<p>` / `<h1>` / `<span>` with Tailwind text classes |
| `<Button variant="contained">` | `<button className="bg-primary text-white ...">` |
| `<TextField>` | `<input className="border rounded-lg ...">` |
| `<Select>` / `<MenuItem>` | Custom dropdown or headless UI |
| `<Table>` | `<table className="...">` |
| `<Chip>` | `<span className="px-2 py-0.5 rounded-md ...">` |
| `<Dialog>` | Custom modal with backdrop |
| `<Snackbar>` / `<Alert>` | Custom toast (sonner or react-hot-toast) |
| `<Skeleton>` | `<div className="animate-pulse bg-muted rounded-lg">` |
| `<CircularProgress>` | CSS spinner or Lucide `<Loader2 className="animate-spin">` |
| `<Tooltip>` | `@radix-ui/react-tooltip` or custom |
| MUI Icons | Lucide React equivalents |

## Page transitions (known issue — FR-29)

Current Shell renders `{children}` raw — page navigations flicker because every page is
`"use client"` + `useEffect` data fetch. No `<Suspense>` boundary, no skeleton fallback.

**Required fix:**
1. Wrap `{children}` in an animated transition container (CSS `@keyframes` fade-in or
   Framer Motion `<AnimatePresence>`), keyed by `pathname`.
2. Each page exports a skeleton layout as its immediate render (before data loads).
3. Add `<Suspense fallback={<PageSkeleton />}>` around lazy content.
4. Use `startTransition` for non-urgent state updates during navigation.
5. Goal: **zero blank flashes** — every transition smooth and instant.

## Known UI/UX debt (FR-29)

- Generic MUI look — needs premium gradients, depth, micro-animations.
- Settings pages are placeholder-level — need real functional forms.
- No data visualization components (charts, sparklines).
- Inconsistent empty states — some have text, some have nothing.
- Loading states use `CircularProgress` — should be skeleton screens.
- Brand color `#2D8B73` underutilized — mostly flat solid, needs layering.
