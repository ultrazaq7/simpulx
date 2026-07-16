# Next session — pick up here

Pre-launch (no active users). Budget Rp 2jt/mo. Prod: single `t4g.medium`, all 13
containers incl. Postgres. Deploy = push to main (~2-4 min; poll the prod image tag).
DB: `docker exec simpulx-v2-db psql -U simpulx -d simpulx_v2` (db name `simpulx_v2`).
Org test: `00000000-0000-0000-0000-0000000000a1`. Catalog campaign:
`5da74098-0518-41a7-8fea-1e08e6a715dd` (500 rows, Jakarta only, Mitsubishi).

## Working rule that keeps paying off
Verify against prod BEFORE building (3 premises retracted that way) and AFTER
(drive the real path, not the function — `c07010d` passed every unit test and still
dropped the row). Verifying the grounding fix immediately exposed a second bug I'd
just introduced. Label verified vs assumed.

---

## DONE + VERIFIED this session (don't redo)

| Commit | What | Proof |
|---|---|---|
| — | **P5 model compliance** | 8/8 live nurture replies obey `CATATAN AREA`, incl. 3 adversarial (model actively corrected a customer asserting the Jakarta price). The retracted-NULL premise stands retracted. |
| `e303348` | **Ads OAuth tokens encrypted at rest** (AES-256-GCM) | Prod: token now `enc:v1:…`; backfill encrypted 1 plaintext row; real Meta sync decrypts + succeeds (`ad auto-sync ok`). Key `ADS_TOKEN_ENC_KEY` in `/opt/simpulx/.env` (backup `.env.bak-20260716-193911`). **Losing it = customers must reconnect.** |
| `123922d` | **web_api keys hashed** (SHA-256, show-once) | Migration 0096 dropped the plaintext column. Live: correct key → 200 + contact created; wrong key → 401. |
| `e56ff60` | **iOS mic permission primed at login** | `flutter analyze` clean. ⚠️ **NOT device-tested.** |
| `1a12cf2` | **P4: unread badge patched from events** (no per-message refetch) | Structure verified: `listConversations` now only on mount/reconnect/seq-gap. ⚠️ **NOT browser-tested.** |
| `ae29a91` + `049e188` | **Grounding chain fixed** (see below) | Turn-1 for "Xforce" now returns XFORCE Jakarta rows from the campaign's own catalog. Was: *Pajero Sport, Dipo Star Finance **Surabaya**, Bojonegoro*. |
| — | **`finance_packages` TRUNCATED** | 332,821 rows / 67 MB → 0. Nothing depended on it (both campaigns have their own 500-row catalog). Recoverable from the nightly backup for 30 days. **100% catalog now.** |

### The grounding chain (was live, now fixed)
Three linked causes made every branded campaign's **turn 1** ground on another
dealer's cars:
1. `needle = model or brand` → before extraction the needle became the campaign brand
   ("Mitsubishi"), but `item_name` holds MODEL names ("XFORCE EXCEED CVT") → **0 rows**.
   Fixed: match on **model only** (campaign_catalog is already campaign-scoped).
2. 0 rows fell through to the **global `finance_packages`** — the exact cross-dealer
   leak WS-A exists to prevent. Fixed: campaign has a catalog → **never** fall back.
3. Extractor wrote competitor mentions as the lead's brand — a Mitsubishi campaign held
   `{"brand":"Daihatsu","model":"Xforce"}`. Fixed: branded campaign ⇒ **pin** the lead's
   brand to the campaign's.
4. (found by verifying the fix) `LIMIT 300` over 500 rows ordered by `item_name` cut off
   every XFORCE row (X sorts last) → turn 1 answered Destinator. Fixed: `LIMIT 3000`
   (ranking runs in Python, so a truncated fetch ranks rows it never saw).

---

## OPEN FINDING — not fixed, highest value next

### Anchoring: the AI volunteers prices nobody asked for
**Verified 3/4 runs.** An out-of-area lead who only said *"saya minat Xforce, saya di
Wamena"* (no price question) got *"Sebagai gambaran, di Jakarta OTR Rp 426.850.000"*
unprompted. Same when they asked about **colour**. Not the wrong-city bug (the city is
named correctly) — it's **anchoring**: the customer never asked, now expects 426jt, and
the agent's real Wamena price will differ.

Cause — last line of the `CATATAN AREA` note (`finance_rag.py`, ~line 222):
> "**Boleh** sebut harga di atas **HANYA sebagai gambaran** dan WAJIB sebut nama kotanya."

`HANYA` limits it to "as an illustration", **not** to "only when asked". The model reads
open permission and uses it.

**Fix (agreed, not yet applied):**
```
JANGAN sebut angka harga sama sekali KECUALI customer SECARA EKSPLISIT menanyakan
harga/DP/cicilan. Kalau tidak ditanya, JANGAN pancing dengan angka. Kalau ditanya:
bilang data areanya belum tersedia, tawarkan cek ke tim, dan boleh sebut harga di atas
HANYA sebagai gambaran + WAJIB sebut nama kotanya.
```
**Must re-test both sides:** (a) didn't ask → no number, (b) asked → still gives the
reference + names the city (don't let the fix make it refuse when asked).

---

## AGREED, NOT STARTED — out-of-area → human agent (3 parts)
Decided with the user; build in this order:
1. **Persist covered cities on the campaign.** Today the cities come from **transient UI
   chips** on upload — `page.tsx:327` does
   `parsed.flatMap(r => locations.map(loc => ({...r, location_name: loc})))`, i.e. the
   chips OVERRIDE the file and fan each product out per city (100 × 5 = the 500 rows).
   Chips empty + file has no city column ⇒ **all NULL**. Nothing is stored on the
   campaign, so "out of area" can't be decided deterministically.
2. **Guard UI**: block + hint if no city chosen AND parsed rows carry no location.
3. **Out-of-area ⇒ handoff.** `lead.city ∉ campaign.covered_cities` → hand to a human,
   **with a note** ("luar area (Wamena) — cek domisili & serviceability").
   *Rationale (user's, and correct):* KTP-vs-domicile/financing area is human judgment —
   an out-of-town KTP living in the covered city is common and a real lead.
   *Design:* let the AI collect the standard qualifiers FIRST, then hand off — a human
   receiving a context-less lead is worse, and instant handoff floods agents.
   **Note:** "collect then handoff" ALREADY works —
   `if result.ready_for_handoff or fields_done: _ai_handoff(...)`. The gaps are only
   (a) out-of-area is not itself a trigger, so a lead who bails mid-qualification never
   reaches a human, (b) the handoff note is generic, (c) no persisted city list.

---

## PRICING / UNIT ECONOMICS — decided
Full analysis (grounded in prod `llm_usage` + the price table):
https://claude.ai/code/artifact/915f1932-b731-43ba-89b0-fb496ef9e1d0

- **Cost/credit** (1 credit = 1 bot reply), from real tokens: **Rp 91–160 now**
  (Sonnet-5 intro), **Rp 135–240 after 2026-08-31** (promo ends, +50%). Cold cache
  (sparse org) is the expensive end — the catalog is re-cache-written per reply.
- **Worst-case argo ≈ Rp 320/reply** (cold cache + full 400-token output + long history +
  post-promo). Typical reply: Rp 80–160.
- **Seats are the engine** (margin 63–87%) — keep Rp 200/150/100k, 200 bonus credits.
- **Top-up floor Rp 350** (Enterprise 275 → 350): mathematically no single reply can lose
  money, even worst-case. Booster 400, Pro 375. Discount curve flattened.
- **Catalog extraction = FREE, final.** Fair: the LLM there serves the user's upload
  convenience *and* gives Simpulx clean, consistent data — dual benefit. Uploads are
  naturally rare (campaign start + occasional price change), so cost is bounded. Code
  already charges 0 — **don't implement a charge.**
- **Lead-data extract: keep FREE too** → clean model: **"1 credit = 1 AI reply to the
  customer"**; lead scoring / data extraction / catalog = free, included.
- ⚠️ **Quotation Section 4 is wrong** — it promises extraction costs 1 credit. Reword to
  the clean model above, or PT Carbay's ledger won't match the document.
- **Sample caveat:** cost figures come from n=49 (one day). Direction is solid (computed
  from real tokens × the code's price table) but **don't hard-commit prices until ~5k+
  messages**. Reconcile a full post-deploy UTC day's `SUM(cost_usd)` against the
  Anthropic CSV.

## LLM CONFIG — decided (Anthropic-only), not yet applied
Mixing OpenAI was considered and rejected: the cheap tier already exists in-house
(Haiku 4.5, $1/$5 = 3× cheaper), Anthropic prompt caching is load-bearing in the cost
structure and wouldn't survive a split, and the margin problem is pricing/metering, not
"Claude is expensive".

| Feature | Now | Target |
|---|---|---|
| nurture, reply (customer-facing) | Sonnet 5 | **keep** — quality = conversion |
| extract, summary, catalog (backend) | Sonnet 5 | **Haiku 4.5** (3×) |
| lead scoring | CatBoost | keep (free) |

Second lever: **shrink the catalog injection** (14 rows → the asked variant + 3–4).
`cache_write` of the ~2,600-token catalog is the biggest per-credit cost in sparse
traffic — this is the largest per-credit lever, bigger than Haiku.
Both together: worst-case argo Rp 320 → ~Rp 200.

---

## STILL QUEUED
- **P6 per-seat billing** — needs an append-only membership ledger (current `users`
  columns are state, not history; `inactive_since` is overwritten). Decided: `rate_per_user
  numeric(12,2)` + `currency text NOT NULL DEFAULT 'IDR'` on `org_subscriptions`; daily
  proration, any activity on a day ⇒ that whole day bills. **Open question for the user:
  divide by the month's real length (28/30/31) or a flat 30?** AI credits are prepaid —
  `llm_usage` is NOT a billing source.
- **Android release** (Play Console): edge-to-edge ×2 (SDK 35 insets) + picture-in-picture.
- **Device-test** the iOS mic fix; **browser-test** the P4 unread badge.
- **P7 ads** (verified this session): cron lives in the gateway process with no leader
  election → duplicate syncs once the gateway scales (dormant at 1 instance). Google Ads
  quota claim is not code-verifiable — check the console.
- **P3 S3 cutover** (bucket + 152 files staged; MinIO still live).

## DO NOT
- Don't buy Reserved Instances / RDS / t4g.large before a 1k load test.
- Don't "fix" the Sonnet-5 promo pricing in `llm_usage.py` — $2/$10 until 2026-08-31 is
  correct and the cutover is handled per call date.
- Catalog cache is in **Redis** (`catalog_extract_cache:*`), not the DB. A fast reply =
  cache hit. Use `force:true` or a different PDF to force real extraction.
- In a `StreamingResponse`, code after the final `yield` is not guaranteed to run — do
  side effects BEFORE the terminal event.
