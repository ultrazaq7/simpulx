# 03 — Product Requirements

> Functional + non-functional requirements. Status legend: ✅ done · 🟡 partial ·
> ⬜ planned. Reflects the codebase as of 2026-06-01 (see [19-current-state.md](19-current-state.md)).

## MVP pillars (customer-defined)

1. Smart lead qualification & scoring
2. Smart auto follow-up (4h window, NOT an AI chatbot)
3. Call tracking (WhatsApp call redirect + attempt logging)
4. SLA monitoring

## Functional requirements

### FR-1 Inbound ingestion & attribution ✅
- Receive WhatsApp Cloud API webhooks (and Meta Messenger/Instagram).
- Resolve channel by `phone_number_id` / page id / IG account id.
- Upsert contact, attribute to a campaign (referral → keyword), persist message.
- Multi-thread: separate conversation per campaign (BR-7..BR-10).

### FR-2 Fair distribution ✅
- Round-robin assign new campaign threads to campaign agents; cursor only advances on
  real routing (BR-11, BR-12).

### FR-3 Lead qualification & scoring ✅
- Rules classifier sets interest level + funnel stage + off-topic disposition from
  genuine customer messages.
- LLM field extraction: brand, model, city, purchase_timeframe, lost_reason.
- Human override locks classification (BR-15).

### FR-4 Smart auto follow-up ✅ (gated cron) / 🟡 (content quality)
- Cron every 15 min finds eligible idle conversations (BR-18) and asks ai-agent to
  generate a human-sounding follow-up; sent as a bot outbound.

### FR-5 Inbox / conversations ✅
- List (role-scoped), open thread, paginated message history, send text/media, internal
  notes, quick replies, assign, close, toggle bot, stage/disposition/lost-reason edit.

### FR-6 Call tracking 🟡
- `POST /api/conversations/{id}/calls` logs an attempt + (optional) duration to
  `call_attempts`/`total_call_duration`. Mobile "Call Customer" WA-redirect UI ⬜.

### FR-7 SLA & analytics 🟡
- Conversation timestamps captured (`first_responsed_at`, `last_contact_message_at`,
  `last_agent_message_at`, `followup_count`, `call_attempts`). Stats + campaign analytics
  endpoints exist; full SLA dashboard (FRT, avg RT, conversion funnel) 🟡.

### FR-8 Campaigns management ✅
- CRUD campaigns, dealer name, attribution rules, agents, routing. Paginated table UI.

### FR-9 Channels ✅
- CRUD WhatsApp/Meta channels, test connection, mock mode for dev (`WA_MOCK`).

### FR-10 Templates (HSM) ✅
- CRUD message templates, submit-to-Meta (simulated in mock mode), status tracking.

### FR-11 Automation ✅
- Trigger → action rules + a visual flow builder per automation.

### FR-12 Broadcasts 🟡 (basic working) / ⬜ (production-grade)
- ✅ Basic: create broadcast (template or free text), recipient insert, event publish.
- ⬜ **Create wizard (6 steps)**: Campaign Name → Select Sender (channel picker) →
  Select Contacts (filter/search/segment/upload CSV, not just "all") → Select Template
  (preview) → Test Send (send to 1 number first) → Review & Confirm.
- ⬜ **Broadcast detail page** (`/broadcasts/{id}`):
  - **General tab**: summary cards (Total Message, Total Sent, Total Spent IDR, Total
    Responses, Response Rate, Avg Response Time) + Send Status pie chart (Blocked/
    Failed/Not WA Number/Pending/Sent) + Read Status pie chart (Delivered/Sent/Triggered/
    Viewed) + campaign metadata + message preview.
  - **Messages tab**: per-recipient table (Customer Name, Phone, Direction, Send Status,
    Type, Read Status) + quick filters (Pending/Failed/Responses) + Filter + Download.
- ⬜ **Backend broadcast worker**: dedicated worker (messaging service) that processes
  `broadcast_recipients` in batches, sends via WA API, updates per-recipient status
  (pending→sent→delivered→read/failed), respects Meta rate limits (80 msg/sec), tracks
  `total_spent` (WA conversation pricing). Currently only publishes event, no worker.
- ⬜ **Schedule**: immediate ("Send Now") or scheduled (datetime picker). Running Since
  + End Time tracking. Status: draft → queued → sending → completed/failed.
- ⬜ **Export**: per-broadcast recipient list export (CSV).

### FR-13 Sequences / drip ✅
- Timed multi-step sequences; conversation enrollment; stop on reply.

### FR-14 Knowledge base ✅ (ingest) / 🟡 (semantic quality)
- Ingest text → chunk → embed (pgvector). Used to inform follow-ups. Embeddings now
  `EMBED_PROVIDER=openai` (`text-embedding-3-small`, 1536-dim); previously-embedded KB
  must be re-embedded (different vector space).

### FR-15 Users, roles & permissions ✅ (config) / ⬜ (enforcement)
- Users: paginated table, invite, edit (admin can change email + reset password),
  activate/deactivate, dept/campaign membership, last login.
- Roles: permission matrix (menus + actions) stored per org. **Enforcement of the matrix
  in backend/sidebar is not yet wired** (config only).

### FR-16 Settings ✅
- General (workspace name), Branding, Notifications, Departments, AI Agent config,
  Knowledge, Audit log, plus the marketing/dev group above. Persistent settings layout.

### FR-17 Auth ✅
- Email/password login (argon2id), JWT (HS256). Forgot/reset password via SMTP (dev:
  reset link logged when SMTP unset). `last_login_at` tracked.

### FR-18 Audit log ✅
- Mutating admin actions recorded (`audit_log`) with actor, action, entity, detail.

### FR-19 Premium Inbox ⬜
- Multi-select checkbox filters with search + "Select All" (Status, Stage, Campaign,
  Interest). No channel/source filter (agent sees only own convos).
- Quick toggles: ⚡ Segera Follow Up (Hot/Warm + unread), 📨 Unread, 🕐 Needs Reply.
- Sort modes: Newest, Oldest, Priority (lead_score DESC — hidden from UI), Longest Waiting.
- Lead score **never displayed** as a number to sales users — only used for sorting.
  Interest chips (Hot/Warm/Cold) are the visual indicator.
- In-conversation message search (`Ctrl+F`).
- Component decomposition: ConversationList, ConversationCard, ChatPanel, MessageBubble,
  Composer, DetailsPanel, MultiSelectFilter.

### FR-20 WhatsApp Call + Call Tracking ⬜
- Call button in composer (next to attachment).
- **Dual-mode**: if WA Cloud API calling is available on the channel → use API call
  (logged automatically as `api`). If not → redirect to WhatsApp app on agent's device
  via `wa.me/{phone}` deeplink or `tel:{phone}` (logged as `manual`, agent inputs duration).
- **Blinking indicator**: if lead is Hot + >3 messages exchanged + never called → phone
  icon blinks on conversation card (signal: "this person is engaged, try calling").
- Call log must clearly distinguish `call_type`: **"API Call"** vs **"Manual Call"**.
- Phase 2: WhatsApp Flow Business call request → customer Accept/Deny → On Call overlay
  (timer, mute, end). Requires WA Cloud API v18+ with calling capability.

### FR-21 System Logs ⬜
- Dedicated `/logs` page with tab bar: Messages | Conversations | User Activity | System | Calls.
- **Message log**: direction, call duration, message type, read/sent status, source URL/ID,
  source type, contact phone, agent name, agent email, created at. Format aligns with
  data-train CSV export columns.
- **Conversation log**: deep per-conversation data: 1st response time, avg response time,
  follow-up activity count, call attempts, total messages, interest level, stage, campaign.
- Each tab: paginated table, date range picker, search, column sorting.

### FR-22 Export + Downloads ⬜
- **Export button** on every log tab → creates background export job (CSV/XLSX).
- **Downloads page** (`/downloads`): table of all export jobs (file name, exporter, date,
  status chip, progress bar, file size, download button).
- Real-time progress via WebSocket (`export.progress` event).
- Status: Queued (gray) → Processing (blue + animated) → Completed (green) → Failed (red).
- Download enabled only when status = completed.

### FR-23 Campaign Verticals ⬜
- Multi-industry support via `campaigns.business_type`:
  - Layanan Keuangan (`financial_services`)
  - Industri Kesehatan (`healthcare`)
  - Properti & Real Estate (`real_estate`)
  - Otomotif > New Car (`automotive_new`)
  - Otomotif > Used Car (`automotive_used`)
  - Otomotif > Refinance (`automotive_refinance`)
- Currently only `automotive_new` is active.
- Conversation detail fields become **dynamic** based on campaign's `business_type`
  (see [09-database-design.md](09-database-design.md) `custom_fields`).
- Dropdown selector in campaign settings.

### FR-24 Campaign Report ⬜
- Per-campaign report: summary cards (leads, replied, converted), performance over time
  chart, agent breakdown table.
- Uses internal data (leads, messages, conversions per campaign).
- Phase 2: Meta Ads API integration for impressions, reach, clicks, ad cost (requires
  OAuth + FB app review).

### FR-25 Lead Intelligence UI ✅ (backend) / ⬜ (frontend)
- **Highlights** tab in DetailsPanel: `lead_summary` card (✨), `suggested_action` chip
  ("Simpuler suggests: …"), lead_score gauge (**visible only to manager/admin role**,
  hidden from agent role).
- Branding: no "AI" wording. Label = "Highlights", assistant = "Simpuler".

### FR-26 WhatsApp Flows ⬜
- **Interactive forms inside WhatsApp** (native UI, no browser redirect). Uses Meta's
  WhatsApp Flows API to send structured forms to customers.
- **Flow types**:
  - **Lead Form**: name, interest product, budget, timeframe → fills `custom_fields` jsonb
  - **Appointment Booking**: date, time, location → creates booking event
  - **Survey / CSAT**: satisfaction rating, feedback text
  - **Product Catalog**: select brand, model, variant, color
- **Agent trigger**: "Send Form" button in composer → pick flow template → send to customer.
- **Customer experience**: receives interactive message in WhatsApp → taps to open native
  form → fills fields → submits → response webhook to gateway.
- **Data capture**: flow response webhook → parse structured data → update
  `conversations.custom_fields` + auto-set relevant fields (stage, interest, extracted data).
  Replaces/supplements AI free-text extraction with clean structured input.
- **Automation integration** (ties to FR-11):
  - **New trigger type**: `flow_response` — fires when a customer submits a WA Flow.
    Trigger config: `{ flow_id, conditions: { field: value } }`.
  - **New action types**:
    - `send_flow` — send a WA Flow to the customer as an automation action.
    - `update_fields` — set conversation fields from flow response data.
    - `assign_agent` — route to a specific agent/department based on flow answers.
  - Example automation: "When customer submits Lead Form AND budget > 500jt → set
    interest=Hot + assign to senior sales team + notify manager."
- **Flow builder**: settings page to manage WA Flow templates (linked to Meta's Flow
  Builder or custom JSON schema). CRUD per org.
- **Reporting**: track flow send rate, completion rate, drop-off per step.

## Business rules (additions)

- **BR-28** — Lead score (0-100) is **never shown** to sales agents. Used only for priority
  sorting behind the scenes. Managers/admins can see it in the detail panel.
- **BR-29** — Call log entries must always have `call_type` = `api` or `manual`. No ambiguity.
- **BR-30** — Blinking call indicator triggers when: `interest_level = 'hot'` AND
  `total messages ≥ 3` AND `call_attempts = 0`.
- **BR-31** — Campaign `business_type` defaults to `automotive_new` for backward compat.
- **BR-32** — Export jobs are per-org scoped. Agent role can only export their own convos.
  Admin/manager can export all.
- **BR-33** — Conversation `custom_fields` jsonb schema is validated against the parent
  campaign's `business_type` on write.
- **BR-34** — WA Flow responses are treated as **inbound messages** (type=`flow_response`).
  They appear in the chat timeline as a structured card (not raw JSON). The structured data
  auto-populates `custom_fields` without overwriting human-set values.
- **BR-35** — Automation `flow_response` trigger evaluates conditions against the flow's
  response fields. Multiple automations can fire on the same response (no exclusivity).
- **BR-36** — Broadcast test send sends to exactly 1 phone number (the agent's own or a
  test number). Test sends do NOT count toward `total_recipients` or `total_spent`.
- **BR-37** — Contact detail page aggregates ALL conversations across ALL campaigns for
  that contact. Timeline shows a unified view, not per-campaign silos.

### FR-27 Contact Detail / History ⬜
- **Contact profile page** (`/contacts/{id}`): click any contact row → full detail.
- **3-column layout** (reference: competitor screenshot):

  **Left sidebar — Profile & Properties:**
  - Large avatar (initial-based, brand-colored), contact name, kebab menu (⋮)
  - "Send message" primary action button → opens/creates conversation in inbox
  - Current lifecycle stage chip (e.g. "Pending payment") with click-to-change
  - **Activity summary**: Joined date, Last message date
  - **Contact info**: phone (with call action), email
  - **Contact properties** (searchable): all fields — first name, last name, phone, email,
    source channel, custom fields from `custom_fields` jsonb. Inline editable.

  **Center — Tabbed content area:**
  - **Activity log** tab (default): unified chronological timeline, grouped by month.
    Each entry = type badge (USER ACTIVITY / SYSTEM / MESSAGE / CALL / BROADCAST / FLOW)
    + action description + detail line + timestamp. Filter dropdown: "All activities",
    "User activities", "System activities", "Messages", "Calls", "Broadcasts".
    Includes: stage changes, messages sent/received, call attempts, broadcast sends,
    flow responses, follow-up enrollments, assignment changes — across ALL campaigns.
  - **Associations** tab: list of all conversations (per campaign) with quick-jump to
    inbox thread. Shows campaign name, assigned agent, status, last activity.
  - **Remarks** tab: internal notes/comments by agents (shared across team). Timestamped,
    with author name. Add new remark via text input.
  - **Media** tab: all media files exchanged with this contact (images, documents, audio).
    Grid/list view with download.

  **Right sidebar — Labels & Lists:**
  - **Labels/Tags**: chips with ✕ to remove, ⊕ to add. E.g. "NEW CUSTOMER", "VIP".
  - **Lists/Segments**: which contact lists or segments this contact belongs to. Add to
    list with ⊕ icon.

- Agents can edit contact info (name, email, tags, custom fields) inline.

### FR-28 Template Enhancement ⬜
- Current template page is basic list + simple create form. Needs production-grade upgrade:
- **Campaign linkage**: templates are wired to campaigns. Each campaign configures which
  templates are available. Manager in a campaign can create templates and only sees
  templates belonging to their campaigns. Admin sees all.
- **Template list** (from screenshot reference): Template Name, Category chip
  (MARKETING/UTILITY), Language, Status (PENDING → APPROVED), **Message delivered count**,
  **Message read rate**, Created By, Last edited, Actions (edit/delete/duplicate).
- **Sync with Meta**: "Synchronize with Facebook" button — pull latest template status,
  delivery stats, and approval state from Meta Cloud API. Auto-update local status.
- **Create template**: full form with real-time WA phone preview (message bubble preview
  with header, body, footer, buttons rendered like actual WhatsApp).
- **Template stats**: per-template delivery metrics (sent, delivered, read, failed) pulled
  from Meta or tracked locally when used in broadcasts.
- **Template categories**: MARKETING, UTILITY, AUTHENTICATION (per Meta's categories).
- **Ownership/scope** (BR-38): Manager role sees only templates linked to their campaigns.
  Agent role cannot create/edit templates. Admin sees all templates org-wide.

### FR-29 Design System + UI/UX Overhaul ⬜
- Current UI is functional but looks like a generic MUI template — no personality, no
  micro-interactions, no premium feel. Needs complete visual overhaul:
- **Design system foundation** (`web/lib/theme.ts` + `globals.css`):
  - Brand color `#2D8B73` is correct, but needs better usage: gradients, depth, layering
  - Add semantic surface colors, glassmorphism cards, subtle shadows
  - Define animation/motion tokens (duration, easing)
  - Premium typography scale with proper hierarchy
- **Page transition flicker (CRITICAL)**:
  - **Root cause**: Shell renders `{children}` directly with no animation wrapper. Every
    page is `"use client"` + `useEffect` fetch → mount=blank, fetch, render = flicker.
    No `<Suspense>` boundaries, no skeleton fallback during navigation.
  - **Fix**: animated page transition wrapper in Shell (fade/slide via CSS or Framer Motion).
    Add `<Suspense fallback={<PageSkeleton />}>` around page content. Each page should
    show a skeleton layout immediately (not a blank div or CircularProgress), then hydrate
    with real data. Consider `startTransition` for non-urgent state updates.
  - **Goal**: navigation between pages should feel instant and smooth — zero blank flashes.
- **Micro-interactions**: hover effects, button press animations, skeleton loaders,
  page transitions, toast animations, card hover lift
- **Data visualization**: chart components (pie, line, bar, sparkline) for dashboard,
  broadcast detail, campaign report — not just raw numbers
- **Settings overhaul**: every settings page needs real functional forms, not just titles.
  Each section should feel complete and enterprise-grade
- **Consistent empty states**: illustrated empty states, not just text
- **Loading states**: skeleton screens instead of CircularProgress spinners
- **Responsive polish**: proper mobile breakpoints, touch targets
- Apply across ALL pages — not just new features

### FR-30 Dashboard Overhaul ⬜
The dashboard must be informative, professional, and COMPLETE — only real data: no errors,
no `NaN`/placeholder/stale-demo/"weird" numbers. Every metric has a real API source scoped by
`organization_id` + role visibility (BR-20), a guarded divide (default 0), and a safe empty
state. Goal: an agent opens it and instantly knows what matters and can act in one tap.
- **Role-aware rendering:**
  - **Web (manager/admin/owner):** full view — headline metric cards + charts + small
    leaderboards. Manager scoped to own campaigns; admin/owner org-wide.
  - **Mobile agent (Android/iOS):** ESSENTIALS ONLY — a few big metric cards + action
    shortcuts, no heavy charts. Keep it to "what do I do now".
- **Core metric cards (agent-critical; every card CLICKABLE → deep-links into a
  pre-filtered Inbox):**
  - **Total leads** — open conversations in scope (agent = own).
  - **Hot** — interest = hot → opens Inbox filtered Interest=Hot.
  - **Segera Follow Up** — Hot/Warm + unread (BR-28) → applies the Inbox follow-up toggle.
  - **Need to Call** — Hot + engaged (>3 messages) + never called (the blinking-call cohort,
    BR-30) → opens Inbox filtered to that cohort.
  - **Unread / Waiting** — customer waiting on a reply.
- **Clickable shortcuts:** each card navigates to `/inbox` with the matching filter/sort
  pre-applied via query params the Inbox reads on mount (e.g. `?interest=hot`, `?followup=1`,
  `?needcall=1`). One tap from "what" to "act".
- **Lead score stays hidden (BR-28):** cards show COUNTS + Interest chips, never the numeric
  0-100 score.
- **Web charts (`recharts`, already installed):** leads over time, interest split
  (Hot/Warm/Cold), stage funnel (new→…→delivered), source mix (ad/keyword/organic), SLA
  (first/avg response time), follow-ups due. Skeleton while loading; illustrated empty states
  when there is no data.
- **Correctness bar:** kill the "weird data" — no fabricated/seeded demo numbers, no division
  by zero, no counting closed/spam as active leads; respect role visibility so an agent's
  counts match exactly what they can open in the Inbox.
- **Sub-surfaces:** the dashboard is an enterprise multi-sub view, NOT one cramped page:
  (1) **Overview** (agent-critical cards above), (2) **Campaign Performance** (per-campaign
  conversion: leads / replied / qualified / converted + conversion rate + value — the headline
  the owner cares about), (3) **Ads Report** (FR-31, its own sub-menu). All scoped by campaign
  isolation (BR-40).

### FR-31 Ads Report & Conversion Attribution ⬜
Its OWN sub-menu (under Reports) — think like a programmatic-ads expert: connect the Meta Ads
report all the way down to follow-up + conversion outcomes (full-funnel attribution, not
vanity clicks).
- **Campaign conversion** is the spine: per campaign, how many conversions succeeded
  (leads → replied → qualified → appointment → converted/won) + conversion rate + value.
- **Ad metrics (Meta Ads API, WS#6 OAuth):** impressions, reach, clicks, CTR, spend, CPM, CPC
  per campaign / adset / creative.
- **Joined to downstream outcomes** via the CTWA attribution chain
  (`referral`/`ctwa_clid` → `conversation_attributions` → conversation → follow-up →
  conversion event): leads generated, conversations, follow-ups sent, conversions, value.
- **Programmatic KPIs:** Cost per Lead (CPL), Cost per Qualified Lead, Cost per Conversion
  (CPA), Lead→Conversion %, ROAS. Rank creative/adset by **downstream conversion, not clicks**
  — surface "which creative actually closes deals."
- **Scope:** obeys campaign isolation (BR-40) — a manager sees only their campaign's ad report.

### FR-32 Mobile app (Flutter) — full rebuild to v2 ⬜
The current `mobile/` folder is a COPY of the v1 app and must be **torn down and rebuilt** to
match v2 in UI/UX, features, functions, and API. Stack stays **Flutter** (iOS + Android),
international-scale, premium UNIQUE design (per the north star in 07 — not a Material default look).
- **Parity with v2:** same brand, same Customer Engagement Platform model, same data (leads,
  inbox, lead intelligence, campaigns), same RBAC + campaign isolation (BR-40/42), same no-"AI"
  wording (assistant = **Simpuler**). Talks to the v2 gateway API + realtime WS.
- **Agent-first, essentials only** (mirrors dashboard FR-30 mobile): open app → instantly see
  what to act on — Hot, Segera Follow Up, Need to Call, unread — one tap into the chat.
- Do NOT carry over v1 screens / flows / branding — rebuild from v2 specs.

### FR-33 Aggressive notifications (mobile, sales-critical) ⬜
Notifications are the lifeline: a sales/manager MUST become aware of every incoming chat and
every recommendation so **NO lead is missed for follow-up**. They must be "galak" (fierce) and
**survive Android battery optimization / Doze**.
- **Android:** high-priority FCM **data** messages handled in a background isolate; high-importance
  channel + heads-up; sound + vibration; **full-screen intent** for the most urgent (new Hot lead
  / SLA breach); request `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` + guide users to whitelist the app
  from OEM killers (Xiaomi/Oppo/Vivo/Samsung); foreground service to keep the socket alive when
  needed; re-alert if an urgent lead stays unhandled.
- **iOS:** APNs `time-sensitive` interruption level (and `critical` alerts where entitled) to
  break through Focus; silent push to refresh in background.
- **Triggers tied to value:** new inbound chat, new Hot / Segera-Follow-Up lead, SLA / 4h
  follow-up due, Simpuler recommendation ready. Tap → deep-link straight to the conversation.
- **Escalation:** unactioned urgent lead re-notifies after N minutes (optionally escalates to
  the manager) — aggressive but deduped so non-urgent items don't spam.

### FR-34 Lost Analysis & Junk Detection ⬜
Detect WHY a lead is lost and weed out junk early. Auto-set disposition + fill `lost_reason`
(**never delete** — reversible; quarantined OUT of the active inbox into a "Lost / Low Quality"
view). Keeps agents focused on real buyers. Two layers: rules (free, instant — `classifier.py`
already half there) + Simpuler (gated, only when confident).
- **Two buckets (clean analytics):**
  - `disposition = lost` — was a real lead, didn't convert with us.
  - `disposition = spam` — never a real lead (junk / spam / iseng / off-topic / abusive / ghost).
  Both get a `lost_reason`; only `lost` counts in lost-rate, **spam is excluded from conversion
  math** so the funnel stays honest.
- **`lost_reason` taxonomy (enum):**
  - **Lost — they DID buy (`did_purchase=true`, competitive/product loss):**
    `bought_other_brand` (+ which brand), `bought_used_car`, `bought_elsewhere` (same brand,
    other dealer/sales), `competitor_promo`.
  - **Lost — not bought (`did_purchase=false`):** `out_of_area`, `price_too_high`,
    `financing_rejected`, `no_budget` / `postponed`, `wrong_product` (spec/seat/transmission),
    `changed_mind` / `not_buying`, `trade_in_issue`.
  - **Spam/Junk:** `spam_junk`, `job_seeker`, `abusive`, `ghosted` (only the ad opener, no
    genuine reply), `duplicate`, `wrong_number`, `test_bot`.
- **`did_purchase` flag** splits "lost-but-bought" (fix offer/product/targeting) vs
  "lost-not-bought" (timing → re-engage later). Sharp owner cut.
- **Auto-set guardrails:** confidence gate (low confidence → only FLAG "suspected junk", do NOT
  auto-set); **never override a human-set disposition** (`COALESCE`); always reversible.
- **Analytics value:** lost-reason breakdown on the dashboard; **junk + lost-reason rate per
  campaign and per ad creative/adset** (FR-31) — kill adsets that bring out-of-area/junk, see
  which brand you keep losing to. Junk = strong negative label for CatBoost retraining (WS#1).
- **Quarantine UX:** a "Lost / Low Quality" filter/tab where agents sweep + rescue false
  positives in one place; the active inbox stays clean.

## Business rules (continued)

- **BR-38** — Template ownership scoped by campaign. Manager creates templates within
  their campaign → only visible in that campaign. Admin-created templates are org-wide.
- **BR-39** — Template sync with Meta should NOT auto-delete local templates that Meta
  rejects. Show rejected status with reason for agent to fix and resubmit.
  response fields. Multiple automations can fire on the same response (no exclusivity).
- **BR-40** — **Campaign is the access-scope unit.** Every agent and manager is a member of
  specific campaign(s) (`campaign_agents`); membership does not cross campaigns (the same
  agent/manager is not shared across campaigns for data purposes). A user's visibility into
  EVERYTHING — leads, conversations, contacts, templates, activity/logs, reports, dashboard
  counts — is filtered to their campaign(s). Data from other campaigns is never visible or
  counted. Enforce at the query layer (campaign_id IN user's campaigns), not just the UI.
- **BR-41** — A campaign is **bound to a channel** (`campaigns.channel_id`). Different
  campaigns may use different channels (a dedicated WhatsApp number, or the shared number via
  keyword routing). Routing, CTWA attribution, and every per-campaign display key off this
  campaign↔channel binding. The channel a campaign uses determines which inbound traffic and
  templates belong to it.
- **BR-42** — **Manager visibility = their campaign(s) ONLY**, including unassigned leads
  WITHIN those campaigns. Managers have NO org-wide or cross-campaign access — not for leads,
  contacts, templates, activity, or reports. Only admin/owner are org-wide. (Refines BR-20.)
- **BR-43** — Notifications by surface: **web = in-app only** (BR-25); **mobile (Flutter) =
  aggressive push** (high-priority FCM / APNs time-sensitive) engineered to survive battery
  optimization. No lead may be silently missed — urgent leads re-alert until actioned (FR-33).
- **BR-44** — Lost vs Spam (FR-34): junk/spam/off-topic/abusive/ghost → `disposition = spam`
  (**excluded from conversion math**); a genuine lead that didn't convert → `disposition = lost`
  + a required `lost_reason` (+ `did_purchase` flag). Auto-set ONLY when confident, NEVER
  overrides a human-set disposition, and is always reversible. Nothing is ever auto-deleted —
  lost/spam leads are quarantined out of the active inbox, not removed.

## Non-functional requirements

- **NFR-1 Multi-tenant isolation** — enforced at query layer by `organization_id` (BR-1).
- **NFR-2 Fast webhook ACK** — gateway must ACK Meta quickly; heavy work is async via
  NATS (ingest only publishes an event).
- **NFR-3 Horizontal scale** — realtime fan-out uses Redis pub/sub so any number of
  realtime instances broadcast to their local WebSocket clients.
- **NFR-4 At-least-once events** — NATS JetStream durable consumers; handlers idempotent
  where it matters (e.g. sequence enrollment `ON CONFLICT DO NOTHING`).
- **NFR-5 Security** — argon2id passwords, JWT, role-based visibility + IDOR guards,
  per-tenant scoping, reset tokens hashed + single-use.
- **NFR-6 Dev ergonomics** — everything runs in Docker; host needs no Go/Python.
- **NFR-7 Go ≥ 1.22** — required for `net/http` method routing (see [10-backend-architecture.md](10-backend-architecture.md)).
