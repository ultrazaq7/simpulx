# 22 — Enterprise + Agentic AI Program (living document)

> Execution plan + progress tracker. **Two tracks:** (A) Enterprise CRM revamp, (B) Agentic AI program.
> **Any agent/session picking this up: read this file first, check the Progress Checklist, update it after every phase.**
> Cancelled scope removed 2026-07-05: Web IA /home + /reports (old Phase 9), Mobile restructure (old Phase 11), Icons → Phosphor (old Phase 12).
> **ai-context docs LAG the real code** — before claiming any feature is/isn't built, grep/read actual source (`services/*`, `web/*`, `db/migrations/`, `scripts/`), incl. ad-hoc tables created in scripts.

## Goal

Simpulx v2 is inbox-first with a **LIVE L3 supervised AI bot** (`maybe_nurture` in `services/ai-agent/orchestrator.py`). Two parallel tracks:

**Track A — Enterprise CRM:** finish the CRM surface — Contacts action hub, Deals module (DB + API + list + kanban), Enterprise Org Setup (Organization + Subscription).

**Track B — Agentic AI:** make the live bot trustworthy, monetizable, and non-colliding — two-tier credits, campaign detail page, segment-generic catalog KB, segment-dynamic qualification, drip removal + automation collision guard, automation flow builder completion, realtime AI activity, consistent Simpuler mark, multi-touch follow-up.

## Locked decisions

**Enterprise (A):**
- Deals first and full; Tickets next batch (disabled "coming soon" stubs).
- Drawer conversions app-wide (SidePanel + strict LIFO Esc). Exceptions: confirm dialogs, one-click menus, CommandPalette, media viewers.
- Manual leads: stage/interest/agent via contact-level fallback columns (option A; NO shell conversations).
- Subscription: real minimal backend; quota types Users, Simpuler credits, Custom fields.
- **Icons: STAY on lucide-react (web) + current mobile icons.** Phosphor migration CANCELLED.
- Never use the word "AI" in UI copy (brand rule); UI copy is English, no em dashes.

**Agentic (B):**
- Autonomy = **L3 supervised** (already live): bot converses in the qualifying phase, KB-grounded, hands off on hot / out-of-KB / nego / low-confidence / explicit-human / angry / N-turns. Per-campaign `ai_auto_reply` gate.
- Segment = **schema-driven** (`campaigns.segment` → one registry drives qualifier questions + extracted `custom_fields` + catalog columns). Automotive is the first schema; other segments are data.
- KB pricelists = **structured lookup table + tool**, NOT embeddings. Calculator = **discrete lookup** (quote dealer rows; defer if not found).
- Credit = **org pool → per-campaign hard cap**; deplete → AI degrades to human (lead never dropped). Meter = **1 credit per Simpuler outbound reply** at bot-outbound persistence (`services/messaging/store.go`, `sender_type='bot'`), NOT the dead `ai_runs` table.
- **Remove manual drip**; **keep** the automation flow node; enforce AI ⟷ automation non-collision (a campaign's customer messaging is driven by AI OR automation, never both).

## Environment rules

- Repo root: `c:\Users\Fachmi Razaq\Documents\Simpulx`. Backend builds **Docker only** (`docker compose build gateway messaging && docker compose up -d`; psql via `docker exec`). Do not batch builds with edits.
- **Next free migration: `0080`.** (0078 contact fields DONE; real 0079 = `web_api_source_platform` — the doc's old "0079 = deals" was never built, so Deals still needs a migration.)
- **CRITICAL: migrations run through goose.** Every `db/migrations/NNNN_*.sql` MUST start with `-- +goose Up` and include a `-- +goose Down`, or goose fails to parse and the ENTIRE deploy aborts at the migrate step (builds still pass, only deploy fails). Complex statements (DO blocks / functions) need `-- +goose StatementBegin/End`.
- Web: Next.js 14.2 App Router, Tailwind **3.4 (do not upgrade to v4)**, recharts, fetch client `web/lib/api.ts`. `components/ui/*` is a dead parallel kit — do not build on it.
- Mobile: Flutter + Riverpod + go_router + dio. Prod APK: `flutter build apk --flavor prod --dart-define=FLAVOR=prod --release`.
- go.mod must stay go 1.22+ (method-prefixed routes 404 otherwise).
- Permission changes must land in 3 places at once: `services/gateway/permissions.go`, `web/lib/permissions.ts`, roles settings matrix UI.
- Design system: `ai-context/07-design-system.md` — crisp corners (not pill), no per-page title blocks, brand #2D8B73 / amber #F5A623, `web/components/Select.tsx` for dropdowns.

## Progress checklist

| # | Item | Track | Status | Notes |
|---|---|---|---|---|
| 0 | This handoff doc | — | DONE | Keep updated every phase |
| 1 | Chat-list tile redesign (web+mobile) | A | DONE | Session badge counts up; responder icon; 24H badge; delivery ticks via last_outbound_status |
| 2 | SidePanel + useEscClose + first conversions | A | DONE | `web/lib/useEscClose.ts` (LIFO) + `web/components/SidePanel.tsx` |
| 3 | SidePanel rollout (all surfaces) | A | DONE | Channel/campaign wizards, custom-fields, people, roles, TemplateWizard, broadcast/drip compose |
| 4 | Contact lead fields + bulk update (mig 0078) | A | DONE | `contacts.stage_id/interest_level/assigned_agent_id`; `contacts_bulk.go`; bulk-update endpoint |
| 5 | Send Template / initiate chat | A | DONE | `TemplateOutbound`; `/api/contacts/send-template`; perm `initiate_chats`; SendTemplateDrawer |
| 6 | Contacts page revamp (web) | A | TODO | needs 2+4+5 |
| 7 | Deals backend | A | TODO | migration 0080+ (renumbered; see env rules) |
| 8 | Deals web UI (list+kanban, dnd-kit) | A | TODO | needs 2+7 |
| 10 | Enterprise Org Setup (Organization + Subscription) | A/B | TODO | mig org_subscriptions; **= org layer of WS-F credits** |
| WS-H | Remove manual drip + AI/automation collision guard | B | TODO | do first (removes an active collision with the live bot) |
| WS-I | Automation flow builder completion | B | TODO | trigger node (#1 priority) + all message types real + callback-payload binding + full wizard |
| WS-F | Two-tier credit system | B | TODO | org pool (= Phase 10) + per-campaign cap + metering |
| WS-G | Enterprise campaign detail page | B | TODO | `/settings/campaigns/[id]`: Overview / Credits / AI / Branches / Agents |
| WS-A | Segment-generic catalog KB (refactor finance lookup) | B | TODO | per-campaign scope + wizard upload + PDF/Excel extract + generalize |
| WS-B | Segment-dynamic lead qualification | B | TODO | replace hardcoded car_* in reply/handoff/extract/DetailsPanel |
| WS-C | Realtime AI activity | B | TODO | `events.ai.activity` phases → inbox live indicator |
| WS-D | Consistent Simpuler mark (web+mobile) + doc-name fix | B | TODO | mobile bubble has no Simpuler identity; filename shows UUID |
| WS-E | Multi-touch follow-up for ghosting leads | B | TODO | single 4h → cadence (+4h/+1d/+3d) |
| Final | Update ai-context 07/19/20 | — | TODO | |

---

# Track A — Enterprise CRM

## Phase 1 — Chat-list tile redesign (web + mobile) — DONE
Web `WindowTime.tsx` `WindowCountdownBadge` (solid blue pill, 1s tick, null after 24h) + `ConversationCard.tsx` responder icon / 24H badge / status icons. Mobile `conversation_tile.dart` countdown badge + responder icon + status chips. Gateway selects `last_sender_type` + `last_outbound_status`.

## Phase 2 — SidePanel + Esc-close app-wide + first conversions — DONE
`web/lib/useEscClose.ts` strict LIFO overlay stack (one global keydown, top-entry only, IME/StrictMode safe). `web/components/SidePanel.tsx` (portal, right drawer, backdrop click-close, sticky footer). Proof conversions: inbox FilterPopover → Filters drawer, roles, people.

## Phase 3 — SidePanel rollout (remaining surfaces) — DONE
ChannelWizard/WebApiWizard/AdWizard, CampaignWizard, templates form, custom-fields form, broadcasts + drip compose, inbox TemplateWizard. Exceptions stay: confirm dialogs, sort/row menus, `Select.tsx`, CommandPalette, media viewer.

## Phase 4 — Backend contact lead fields + bulk update — DONE
Migration 0078 adds `contacts.stage_id/interest_level/assigned_agent_id`. `handleListContacts` COALESCEs conversation-over-contact; `applyContactLead` (`contacts_bulk.go`) routes to conversation (classification_locked + events) if one exists else contact columns. `POST /api/contacts/bulk-update` (gate `edit_contacts`, assign gated owner/admin/manager). `api.ts bulkUpdateContacts()`.

## Phase 5 — Send Template / initiate chat — DONE
`events.go TemplateOutbound`; `whatsapp_sender.go sendTemplateParams`; `main.go onOutbound` Template case; `POST /api/contacts/send-template` (`initiate.go`, perm `initiate_chats` mirrored 3 places); `SendTemplateDrawer` + `api.sendTemplateToContacts`. Rebuild gateway+messaging together (shared events lib).

## Phase 6 — Contacts page revamp (web) — TODO
Split `contacts/page.tsx` (~820 lines) into `contacts/components/`: `ContactsTable.tsx` (inline StageMenu/Interest/AgentAssignCell hit the Phase-4 PATCH so manual leads editable), `SelectionBar.tsx` (N selected → Send Template / Change Stage / Interest / Assign Agent / Add Label / Create Deal / Blacklist / Delete), `FiltersDrawer.tsx`, `ContactDrawer.tsx` (replaces ContactModal, adds stage/interest/agent for manual leads), `PaginationFooter.tsx`.
Verify: web build; every bulk action incl. manual lead; send-template end-to-end; agent scoping.

## Phase 7 — Deals backend — TODO
Migration `deals`: `deal_pipelines` (org, name, is_default, one-default partial index), `deal_stages` (pipeline_id, name, position, is_won, is_lost), `deals` (deal_number bigserial, org, pipeline_id, stage_id, name, amount numeric(18,2), currency IDR, contact_id?, conversation_id?, owner_user_id?, campaign_id?, status open|won|lost, expected_close_date?, closed_at?, created_by) + indexes. Seed default "Sales Pipeline" (New → Qualified → Advanced → Payment In Process → Won → Lost). Lazy `ensureDefaultPipeline(orgID)`. New `services/gateway/deals.go` (copy templates.go CRUD + contacts filtering); routes for pipelines/stages/deals; stage move auto-sets status/closed_at from is_won/is_lost. Scoping: agent=own, manager=all org, owner/admin=all. New perms `menu_deals`/`view_deals`/`manage_deals` (3 places).
Verify: build gateway; seed; CRUD round-trip; Won→status/closed_at; 403 + scoping.

## Phase 8 — Deals web UI (list + kanban) — TODO
> **All deal forms use SidePanel (owner confirmed 2026-07-05) — NO simple/centered popup form.** Only non-drawer overlays: the delete-confirm dialog + the row-action menu.

`npm i @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`. `deals/page.tsx` (pipeline Select + search + FiltersDrawer + list/board toggle + New deal). `DealBoard.tsx` (DndContext: PointerSensor {distance:4} + TouchSensor {delay:200,tolerance:8} + KeyboardSensor; droppable columns, sortable cards, DragOverlay; optimistic PATCH + rollback toast), `DealCard.tsx`, `DealList.tsx`, `DealDrawer.tsx` (SidePanel, searchable contact picker), `FiltersDrawer.tsx`. Shell NAV_TOP `/deals` (perm `menu_deals`) + PAGE_TITLES + CommandPalette. Contacts SelectionBar Create Deal.
Verify: web build; drag mouse + touch; view toggle preserves filters; nav hidden without perm.

## Phase 10 — Enterprise Org Setup (replaces Settings > General) — TODO
> **This IS the org layer of WS-F (credits). Build once.** Its planned "Simpuler credits = ai_replies query" is broken (dead `ai_runs`) — use the WS-F metering fix (bot-outbound persist).
- Migration `org_subscriptions` (organization_id PK, package_name, status active|trial|expired, renewal_date, `quotas jsonb {users, simpuler_credits, custom_fields}`) + seed.
- `services/gateway/subscription.go`: GET `/api/subscription` (gate `view_settings`; rows `[{key,label,limit,used,remaining}]`, used = active users / Simpuler credits this month / custom fields count), PATCH (owner), GET `/api/subscription/usage?type&from&to`.
- Transfer ownership: `POST /api/users/{id}/transfer-ownership` (owner only, single tx).
- Web: `settings/organization/page.tsx` (Company Info + Localization moved from General + Account Owner + Transfer), `settings/subscription/page.tsx` (Package tab + Quota usage tab recharts). `settings/general` → redirect to organization.
- UI copy: "Simpuler credits" (never "AI").
Verify: build gateway+web; seed; GET subscription real counts; transfer-ownership tx; General redirects.

---

# Track B — Agentic AI Program

Code-grounded reality (audited 2026-07-05):

| Area | State | Evidence |
|---|---|---|
| Auto-reply L3 + handoff | ✅ LIVE | `orchestrator.py:201` `maybe_nurture`, `:313` `_ai_handoff` |
| Finance lookup in replies | ⚠️ works, but global + automotive-only + script-load + CSV | `finance_rag.py`, keyed `car_brand`/`car_model` |
| `ai_runs` metering | 🔴 NEVER written (only migration + read) | `api.go:877` only |
| Credits / campaign detail page | 🟢 greenfield | — |
| Segment-dynamic lead fields | 🔴 hardcoded car_* in reply/handoff/extract/panel | `orchestrator.py:308`, `DetailsPanel.tsx:252` |
| Automation executor | ✅ far more complete than docs (branching, keyword modes, interactive buttons/list, set-attr, sheets, forms, status, rest_api) | `automations.go` |
| Automation message types (5 of 8) | 🔴 UI-only (Carousel, Address, Call Permission, Request Phone, Flow-CTA) | `whatsapp_sender.go:160` buttons+list only |
| Trigger node (10 of 15 conditions) | 🔴 UI-only + no multi-condition AND | `automations.go:809` loads only 4 trigger types |
| Realtime AI activity | 🟢 greenfield (9 subjects, none for AI) | `realtime/main.go:85` |
| Follow-up | ⚠️ single 4h only | `orchestrator.py:127` |
| Simpuler mark (mobile) / doc filename | 🔴 no Simpuler identity; filename shows UUID | `message_bubble.dart:45,611` |

## WS-H — Remove manual drip + AI/automation collision guard (do first)
- **Remove standalone drip/sequences:** `web/app/(app)/drip/page.tsx` + Shell "Drip" nav/PAGE_TITLES/shortcut/CommandPalette, sequence perm in roles, sequence types/endpoints in `web/lib/{api,types}.ts`; backend `services/gateway/sequences.go` + routes, `services/conversation/drips.go`, drip hooks in `services/conversation/lifecycle.go`. **Priority: stop the runner/enrollment** so existing drips can't fire on AI-handled leads. Drop `sequences` tables in a cleanup migration. Delete stray `Shell_recovered.tsx`.
- **Keep** the automation flow node (`automation/[id]/flow`, `automations.go`).
- **Collision guard (`automations.go runAutomations`):** skip `send_message`/`send_template` when the campaign has `ai_auto_reply=true` AND `is_bot_active=true`. Non-messaging actions (tag/assign/close/webhook) still run. (An `isAssigned` send-guard already exists at `automations.go:334`.)

## WS-I — Automation flow builder completion
Executor is ~95% built; frontend node wizard exposes 8 message types + carousel + Flow CTA + placeholders + preview. Gaps:
- **🔑 Trigger node (highest priority — the gate for the whole flow).** UI offers ~15 conditions; only 5 real (`keyword_match` any/exact, `button_click`, `new_message`, `new_conversation`-first). UI-only: exclude-keywords, individual-chat, in/outside business hours, catalog order, after-24h, custom condition, file-type, regex, message-type, template-message. UI "Add Trigger Condition" (multi-condition AND) unsupported. Build: multi-condition trigger model + per-condition evaluators + open `activeAutomations` filter (`automations.go:809`, hard-limited to 4 trigger types).
- **Message types real end-to-end** (extend `events.InteractiveOutbound` + `buildInteractive` + `whatsapp_sender.go`). Real: Text, reply Buttons, List, Location (send), WhatsApp Flow (via `send_form`). Build: Carousel (multi-product cards ≤10, image/video + buttons), Address, Call Permission Request, Request Phone Number, request-Location, Flow-CTA button.
- **🔴 Callback/flow-reply payload → merge fields:** `resolvePlaceholders` (`automations.go:594`) only resolves `contactVars`, NOT `{callback_payload_*}` from a tapped button / flow (`nfm_reply`). Populate tap/flow-response fields into merge vars so `Set Contact Attribute` (and downstream) can save `{callback_payload_re_name}` etc. Without this the sample flow stores raw placeholder strings.
- **Set Contact Attribute ↔ custom-field registry:** attribute dropdown binds to `GET /api/custom-fields` (`custom_fields.go` → `contacts.attributes`, the same store WS-B reads); ensure inline field creation.
- **Rename** node label `send_message` → "Auto Reply Buttons/Options/Products" (`web/lib/automationMeta.ts`); keyword **Trigger** node in canvas. **Full wizard** for the node config modal (all types, header, body+placeholders, footer, carousel cards, flow/callback), per reference screenshots.

## WS-F — Two-tier credit system
Org layer = Phase 10 (`org_subscriptions`). WS-F adds the per-campaign layer.
- **Migration:** `campaign_credits` (`campaign_id` PK, `allocated_credits`, `used_credits`, `low_balance_threshold`).
- **Metering hook (`services/messaging/store.go`):** when persisting an outbound with `sender_type='bot'`, atomically `+1 used_credits` on that conversation's campaign. (Also start writing `ai_runs` for observability while here.)
- **Enforcement (`orchestrator.py maybe_nurture` early guard):** before generating a reply, check remaining credits; depleted → skip auto-reply, notify a human, keep the lead. Broadcasts = separate Meta message-cost line.
- **Endpoints (`campaigns.go`):** `GET /api/campaigns/{id}/credits`, `POST /api/campaigns/{id}/credits/allocate`, `GET /api/campaigns/{id}/usage?from&to`.

## WS-G — Enterprise campaign detail page
New route `web/app/(app)/settings/campaigns/[id]/page.tsx`, list row → detail. Tabs: **Overview** (reuse `handleCampaignAnalytics`, `campaigns.go:41`), **Credits & Usage** (WS-F + recharts + low-balance warning), **AI Assistant** (move segment/brand/auto-reply/language/intake config out of `CampaignWizard.tsx` + KB upload from WS-A), **Branches** / **Agents** (reuse `branches.go` + roster).

## WS-A — Segment-generic catalog KB (refactor the existing finance lookup)
Lookup + grounding already work (`finance_rag.py`). Generalize + secure:
- **Promote to migration + scope:** replace the ad-hoc `CREATE TABLE IF NOT EXISTS finance_packages` (`scripts/load_finance_packages.py`) with a goose-migrated generic `campaign_catalog`: spine (`org_id`, `campaign_id`, `segment`, `item_name`, `headline_price`, `effective_month`, `source_ref`) + `attributes jsonb` (auto: variant/dp/tenor/emi; property: unit_type/size/location; finance: plafon/tenor/rate). `campaign_id` scoping fixes the current cross-dealer leak.
- **Wizard/detail upload + extraction:** CSV/Excel → parse rows; PDF → LLM extract (Anthropic) into the same schema + write `data-train/finance_packages/<month>.csv`; warn on scanned PDFs. Re-upload replaces that campaign's rows (`effective_month`).
- **Generalize lookup:** `get_finance_context` → `get_catalog_context(campaign_id, segment, extracted_fields)` scoped by campaign; keep the "use these numbers, don't estimate" grounding rule. FAQ/tone prose stays RAG (`knowledge_chunks`).

## WS-B — Segment-dynamic lead qualification
- **Segment schema registry** (model on `custom_fields.go`): per `campaigns.segment`, a list of `{key,label,type}` fields. Drives qualifier questions + extraction target + catalog columns + DetailsPanel rows.
- **Replace hardcoded car_*:** `orchestrator.py analyze` writes `conversations.custom_fields` per schema (keep car_* read for back-compat); `_should_analyze` fill-fields and `maybe_nurture` handoff `fields_done` (`:308`) key off the schema's required fields.
- **DetailsPanel** (`DetailsPanel.tsx:252`): replace the 4 hardcoded `<DetailRow>` with a loop over the segment schema reading `custom_fields`.

## WS-C — Real-time AI reasoning / activity
New NATS subject `events.ai.activity` `{conversation_id, phase: analyzing|drafting|replied|handoff|waiting, note}` published from `orchestrator.py`; add to the realtime subscribe list (`realtime/main.go:85`). Inbox: live "Simpuler is analyzing… / drafting… / handed off" indicator via the existing `ws_message` CustomEvent.

## WS-D — Consistent Simpuler mark (web + mobile) + mobile doc-name fix
- Web = violet `Sparkles` + "Simpuler" (`MessageBubble.tsx:489`). Mobile bubble has **none** — add the same mark on `sender_type=='bot'` to `mobile/.../message_bubble.dart`; lock one canonical mark.
- **Document filename bug (mobile, both directions):** the real name IS preserved (`messages.metadata.file_name` from `whatsapp.go:288`; upload URL `?name=`; storage key `<uuid>-<name>`), but mobile `_fileName` (`message_bubble.dart:611`) only tries body → `?name=` → last path segment (raw UUID). Fix: surface `metadata.file_name` in the message payload; mobile (and web `filenameFromUrl`) prefer it, then `?name=`, then strip `<uuid>-` prefix, then "Document".

## WS-E — Multi-touch follow-up for ghosting leads
Extend `handle_followup` (`orchestrator.py:127`) from a single 4h touch to a cadence (e.g. +4h/+1d/+3d) with copy variation; template outside the 24h window; stop on genuine reply; keep the ghost→disposition rule (`GHOST_FOLLOWUPS`). CTWA `from_ad` leads get the aggressive cadence. Each touch metered (WS-F).

---

## Recommended build order
1. **WS-H** (remove drip + collision guard) — removes an active collision with the live bot.
2. **WS-I** (automation flow builder — trigger node first) — the flow track the owner is actively speccing.
3. **Phase 10 + WS-F + WS-G** (org subscription + per-campaign credits + campaign detail page) — monetizes the live bot.
4. **WS-A** (segment-generic catalog + per-campaign scope + upload/extract) — secures the cross-dealer leak + unlocks all segments.
5. **WS-B** (segment-dynamic qualification).
6. **WS-C / WS-D / WS-E** (realtime activity, mobile mark + filename, follow-up cadence) — independent polish, parallelizable.
7. Enterprise Track A **Phase 6 → 7 → 8** as a parallel track.
Every step leaves web (`npm run build`) + gateway/ai-agent green.

## Risk notes
- Permission mirroring in 3 places (`permissions.go` + `web/lib/permissions.ts` + roles matrix UI) — Phases 5/7 + WS-H perms touch it.
- Shared events lib change: gateway AND messaging must rebuild/deploy together.
- Manual leads: `managerScope` after COALESCE — test agent and manager listings.
- Template send needs an APPROVED template on a real WABA; the mock sender hides Meta component-format errors (132000) — validate variable count server-side.
- dnd-kit touch: TouchSensor 200ms delay mandatory or board scroll breaks on tablets.
- Bulk assign must enforce the same roles as single assign (owner/admin/manager).
- `ensureDefaultPipeline` for post-migration orgs — without it POST /api/deals fails.
- Metering + collision: automation outbound uses `sender_type='system'` (NOT metered); AI uses `'bot'` (metered) — keep them distinct.
- go.mod must stay go 1.22+.
