# 18 — Roadmap

Status as of 2026-06-03. Sequenced by dependency and customer priority.

## Customer Engagement Platform — product roadmap (11 workstreams)

Branding: **Customer Engagement Platform**, never "AI platform" (no "AI" wording in the app).
Sequenced so the foundation feeds the rest.

1. **Lead Intelligence engine** (foundation) — buy-potential score (CatBoost) + Simpuler
   reasoning (summary + suggested follow-up) + LLM efficiency. **Built + model trained
   2026-06-03** (200 hand-labeled, free), pending deploy ([19](19-current-state.md),
   [15](15-ai-engine.md)).
2. **Premium Inbox** — smart multi-select filters (checkboxes + search + select-all),
   "⚡ Segera Follow Up" quick-toggle, priority sorting (lead_score behind the scenes,
   never shown to sales), in-conversation message search (`Ctrl+F`), animated UI polish.
   Lead score angka **tidak ditampilkan** ke user — cuma dipake buat sorting. Interest
   chip (Hot/Warm/Cold) yang jadi visual indicator utama. Consumes #1's data.
3. **WhatsApp Call + Call Tracking** — tombol call di composer (di samping attachment).
   Strategy dual-mode:
   - **API Call**: kalau WA Cloud API calling tersedia di channel → pakai API, log otomatis.
   - **Manual Call**: kalau tidak → redirect ke WhatsApp app di device agent (`wa.me/{phone}`
     atau `tel:{phone}`), log manual (agent input durasi).
   - Call log harus **jelas label**: "API Call" vs "Manual Call".
   - **Blinking indicator**: kalau lead Hot + sudah engage (>3 messages) + belum pernah
     di-call → ikon telepon kedip-kedip di kartu chat, artinya "coba call orang ini".
   - WhatsApp Flow: Business call request → customer Accept/Deny → On Call overlay
     (timer, mute, end) — phase 2, butuh WA Cloud API v18+.
4. **System Logs + Export + Downloads** — halaman Logs (tab: Messages, Conversations,
   User Activity, System, Call Logs). Message log format mengacu data-train CSV (Direction,
   Call Duration, Message Type, Read/Sent Status, Source URL/ID, dll). Conversation log
   menyajikan deep data: 1st response time, avg response time, follow-up activity,
   call attempts, total messages. Tombol Export di setiap tab → background job CSV/XLSX.
   Halaman Downloads: tabel export history (file name, exporter, date, status + progress
   bar real-time via WS, download button).
5. **Campaign Vertical + Campaign Report** — support multi-vertikal bisnis:
   - Layanan Keuangan
   - Industri Kesehatan
   - Properti & Real Estate
   - Otomotif > New Car
   - Otomotif > Used Car
   - Otomotif > Refinance
   Field `business_type` di level campaign. Detail fields per-conversation jadi **dynamic**
   berdasarkan vertical (otomotif: brand/model/tipe; properti: lokasi/tipe/budget;
   keuangan: produk/nominal/tenor; kesehatan: layanan/lokasi RS). Sekarang baru New Car.
   Campaign Report: summary cards (leads, replied, converted, per campaign), chart
   performance over time. Meta Ads data (impressions, reach, clicks, ad cost) → phase 2
   (butuh Meta Ads API OAuth).
6. **Meta Ads Performance + Conversion Attribution** (FR-31) — its OWN sub-menu under Reports.
   Full-funnel "programmatic" view: Meta Ads (impressions/reach/clicks/CTR/spend/CPM/CPC per
   campaign/adset/creative, via Ads API OAuth) **joined down to outcomes** through the CTWA
   chain (`referral`/`ctwa_clid` → `conversation_attributions` → conversation → follow-up →
   conversion). Programmatic KPIs: CPL, Cost per Qualified Lead, CPA, Lead→Conversion %, ROAS.
   Rank creative/adset by **downstream conversion, not clicks** ("which creative closes deals").
   Campaign conversion is the spine; scoped by campaign isolation (BR-40/42).
7. **WhatsApp Flows** — interactive forms inside WhatsApp (native UI). Lead form,
   appointment booking, survey/CSAT, product catalog. Agent sends via "Send Form" button
   in composer; customer fills in WhatsApp → structured data auto-fills `custom_fields`.
   **Automation integration**: new trigger type `flow_response` (fires on form submit);
   new actions `send_flow`, `update_fields`, `assign_agent`. Example: customer submits
   lead form with budget >500jt → auto-set Hot + assign senior sales + notify manager.
   Flow templates managed in Settings → Flows (CRUD per org, linked to Meta WA Flow IDs).
8. **Broadcast Production** — **mostly DONE (2026-06-04, v1-parity pass).** Shipped: **5-step
   wizard** (Name → Channel → Audience → Message → Review) matching v1 (`legacy-v1` Flutter) in
   v2 tokens; **real audience targeting** (All / tag filter / Selected contacts + phone import);
   **test send**; cost estimate; WhatsApp device preview; send-now-vs-draft; list cards with
   Send-now/Delete/progress. Backend: `handleCreateBroadcast` honors channel/audience/tags/
   contact_ids/send_now + new `test-send`/`{id}/send`/`DELETE` endpoints; dedicated worker
   (`services/broadcasts`, rate-limited) already existed. **Remaining:** broadcast detail page
   (per-recipient tab + charts), `delivered_count`/`read_count` tracking (schema has sent/failed
   only). See [19](19-current-state.md).
9. **Contact Detail / History** — `/contacts/{id}` profile page with unified activity
   timeline (all messages, calls, stage changes, broadcasts, flow responses across ALL
   campaigns), conversations panel, details sidebar, call history, broadcast history,
   editable contact info + notes.
10. **Template Enhancement** — campaign-linked templates (manager sees only their
    campaign's templates), template delivery stats (sent/delivered/read/failed), Meta
    sync button, create form with real-time WA phone preview, template categories
    (MARKETING/UTILITY/AUTHENTICATION). Scope: admin=all, manager=own campaigns, agent=read-only.
11. **Design System + UI/UX Overhaul** — fix page transition flicker (Suspense +
    animated wrapper in Shell), micro-interactions, data visualization components,
    skeleton loading states, settings page overhaul, consistent empty states, responsive
    polish. Brand color `#2D8B73` is correct but underutilized — needs gradients, depth,
    layering. Goal: every page should feel premium and alive, not like a generic template.
12. **Dashboard Overhaul** (FR-30) — make the dashboard informative, professional, and
    COMPLETE with only real data (no errors / NaN / fabricated demo numbers). Agent-critical
    metric cards that are CLICKABLE deep-links into a pre-filtered Inbox: Total leads, Hot
    (→ Interest=Hot), Segera Follow Up (Hot/Warm+unread), Need to Call (Hot + >3 msgs + never
    called, BR-30), Unread/Waiting. Web (manager/admin/owner) gets charts (trend, interest
    split, stage funnel, source mix, SLA) via `recharts`; mobile agent (Android/iOS) gets the
    essentials only — big cards + shortcuts, no heavy charts. Lead score stays hidden (BR-28):
    show counts + Interest chips, never the 0-100 number. Goal: open dashboard → know what
    matters → act in one tap.
13. **Mobile App (Flutter) Rebuild** (FR-32) — the `mobile/` folder is a v1 copy; tear down and
    rebuild to fully match v2 (UI/UX, features, functions, API, RBAC + campaign isolation BR-40/42,
    no-"AI" wording, assistant = Simpuler). iOS + Android via **Flutter**, international-scale,
    premium UNIQUE design per the north star (07). Agent-first essentials (Hot / Segera Follow Up
    / Need to Call / unread) with one-tap into the chat.
14. **Aggressive Notifications** (FR-33) — sales-critical: never miss a lead. Android high-priority
    FCM data messages + heads-up + full-screen intent + ignore-battery-optimization + OEM
    whitelist guidance + re-alert on unactioned urgent leads; iOS time-sensitive / critical alerts.
    Web stays in-app (BR-43). Every notification deep-links to the conversation.

> **WS#11 scope note:** it now means EVERY web screen gets a unique, premium, enterprise redesign
> per the **design north star** (07) — refined crisp corners (NO over-rounding), references
> Linear / Stripe / Vercel / Superhuman, zero generic-template look. Mobile follows the same bar.

The MVP-completion items below remain valid and run in parallel with the above.

## Now (MVP completion)

1. **Enforce the role permission matrix.** Matrix is stored (`/api/role-permissions`) but
   not enforced. Gate sidebar menus + API actions by the caller's role permissions.
   (Security-relevant — see [16](16-security.md).)
2. **SLA dashboard.** Timestamps are captured; build the metrics surface: first response
   time, avg response time, leads touched, WA-button clicks, follow-up count, appointments
   created, conversion (Booking/Purchased). (MVP pillar 4.)
3. **Reconcile classifier stages → action funnel.** DB seeds the action funnel
   (new→…→delivered); the rules classifier still emits intent-based stage keys. Map intent
   → funnel so stage writes are consistent (BR-14).
4. **Follow-up content quality.** Feed distilled KB facts into the follow-up prompt;
   finish the `distill_kb.py --ingest` phase.

## Next (call tracking + mobile)

5. **Call tracking (mobile).** Native "Call Customer" shortcut in the chat screen that
   deep-links to the WhatsApp voice call for the contact, logging an attempt
   (`POST /api/conversations/{id}/calls`). Android (Kotlin) + iOS (Swift). Duration for WA
   calls is not capturable from outside WhatsApp — log attempts first.
6. **Mobile inbox** (native) with FCM push (tokens already captured via
   `/api/users/fcm-token`).
7. **Server-side pagination** for People/Campaigns/Conversations as row counts grow
   (client pagination is fine for now).

## Then (production readiness)

8. **v2 deploy pipeline.** Build CI/CD for the Go services + Next.js web + Python AI
   services to the VPS (separate from the v1 pipeline). Containerize web; wire Nginx
   routes; health checks. Commit `v2/` to git first (excluding scratch/PII).
9. **Security hardening (P0 — audit-confirmed blockers):** realtime WS JWT auth + origin
   restriction, Meta webhook signature verification (`META_APP_SECRET` not in codebase),
   rate limiting on `/auth/*`, `/v1/leads`, `/webhook/*`, prod CORS lockdown, secrets
   store. See [16-security.md](16-security.md).
10. ~~**Semantic embeddings:**~~ Done — `EMBED_PROVIDER=openai` (`text-embedding-3-small`).
    Re-embed any previously-embedded KB (different vector space).
11. **Migration discipline:** stop editing `0001_core.sql`; append forward-only
    migrations + a runner that applies pending migrations to existing DBs.

## Later (scale + intelligence)

12. **Distribution upgrades:** skip-offline-agents, load-weighted assignment
    (`open_chats`), shift/availability. **No auto-rebalance** — ownership changes are
    human-only (BR-27); notify manager for manual reassignment instead.
13. **Fine-tuning / few-shot** from `ai_runs` + distilled data for sharper classification.
14. **Billing & credits** at the campaign level (BR-5) — usage metering, dealer invoicing.
15. **gRPC** between services (event contracts currently JSON over NATS; README notes gRPC
    "menyusul").
16. **Analytics depth:** cohort/funnel analytics, per-dealer scorecards, export scheduling.

## Explicitly out of scope (per product decision)

- AI auto-reply / chatbot conversing with customers (BR-17). The AI classifies, extracts,
  and drafts follow-ups only.
