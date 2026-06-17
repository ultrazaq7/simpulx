# 15 — AI Engine

> **Branding rule (WAJIB):** this is a **Customer Engagement Platform**, not an "AI
> platform". The word "AI" must NOT appear anywhere user-facing. Internally we still have
> two engines; in the UI they surface as *Lead Score*, *Highlights*, *Suggested next step*.
> The reasoning assistant is named **Simpuler**.

Two engines, by design:
- **Simpuler (LLM reasoning brain)** — classify leads, extract structured fields, write a
  short summary + suggested next step, draft follow-ups. Deliberately does **NOT** auto-reply
  to customers (BR-17).
- **Buy-potential Lead Score (CatBoost prediction brain)** — a 0-100 score for "call first"
  ranking, computed cheaply on every message.

They feed each other: Simpuler extracts facts (brand/model/city) → those become categorical
features for CatBoost. Source: `services/ai-agent/` + `libs/python/simpulx_common/llm.py`.

## Components

| Component | File | Role | Cost |
|---|---|---|---|
| Rules classifier | `ai-agent/classifier.py` | interest + stage + off-topic + `is_trivial` | free, instant |
| Buy-potential score | `ai-agent/lead_score.py` (CatBoost) | 0-100 score on every inbound | free, instant (no model = no-op) |
| Feature extractor | `ai-agent/features.py` | numeric + categorical features, shared train/serve | free |
| Field + summary | `llm.py` (`analyze`) | brand/model/city/timeframe/lost_reason + summary/priority/suggested_action | LLM call (gated) |
| Follow-up generator | `llm.py` (`draft_followup`) | human-sounding 4h follow-up | LLM call |
| RAG retrieval | `ai-agent/rag.py` | pgvector cosine search over KB | free |
| Embeddings | `simpulx_common/embeddings.py` | OpenAI `text-embedding-3-small` (`EMBED_PROVIDER=openai`) | paid |
| LLM provider | `simpulx_common/llm.py` | `anthropic` (chat) or `mock` | paid / free |

## On inbound (`handle_inbound`)

No reply is ever sent. Per inbound message:
1. **`classify_and_update`** — rules classifier (0 token) over *genuine* inbound messages →
   writes `interest_level`, `ai_stage`, `stage_id`, disposition, reason, confidence (respects
   `classification_locked`). Returns `{interest, stage_key, categories, off_topic, changed,
   new_strong_intent}` so the caller can gate the LLM.
2. **`lead_score.score_and_update`** — CatBoost buy-potential score (DB-only, LLM-independent),
   runs for EVERY inbound. No-op until a model artifact exists.
3. **Gated `llm.analyze`** — extract fields + summary + suggested next step. **Only called when
   it's worth it** (see Efficiency). Writes `car_brand/model/city/purchase_timeframe/lost_reason`
   + `lead_summary`, `lead_priority`, `suggested_action`(+reason+confidence), stamps
   `ai_extracted_at`. NO chat reply is requested (saves output tokens).

## Efficiency (token discipline)

LLM spend is controlled at three levels (`orchestrator._should_analyze` + `llm.py`):
- **Model:** routine work runs on **Sonnet** (`claude-sonnet-4-6`), not Opus. Default in
  `settings.py`; `ai_agents.model` can override per agent (0027 sets default + existing rows).
- **Call only on change:** skip the LLM when the message is `off_topic`, `is_trivial`
  (filler/ack/emoji), or nothing changed. Call when: first analysis, classification `changed`,
  a new strong intent appears, or a required field is still missing and the message carries an
  entity. **Burst cooldown** (`ai_extracted_at`, 45s) collapses a flurry of short WhatsApp
  messages into ~1 call. The rules classifier + score still update every message, so the CRM
  stays live even when the LLM is skipped. Decisions are logged (`llm skipped: <reason>`).
- **Lean calls:** `analyze()` omits the unused chat reply; `draft_followup()` is reply-only;
  static instruction prefix is prompt-cached; history trimmed to 8; token `usage` is logged.

## Buy-potential Lead Score (CatBoost)

A 0-100 prioritization score, NOT a sales-outcome prediction (label is currently an LLM proxy).
Pipeline (all in `scripts/`, run in Docker):
1. **`label_conversations.py`** — Originally designed for Haiku to read threads; **bootstrapped
   with 200 hand-labeled threads** (agent read each transcript against a rubric → `labeled.jsonl`;
   no API cost). Can also run with `ANTHROPIC_API_KEY` for bulk labeling.
2. **`build_features.py`** — CSV threads → feature rows. Categorical brand/model/city scanned
   from text by the SAME gazetteer the serving path uses (parity).
3. **`train_lead_score.py`** — `CatBoostClassifier(cat_features=…)` → `models/lead_score.cbm`
   + `model_card.json` (AUC/PR-AUC/precision@k + AUC≥0.70 gate).
4. **`lead_score.py`** — at serve time, rebuilds the same feature row from live Postgres
   (`car_brand/model/city` from Simpuler, normalized identically) → `predict_proba` → `lead_score`.

**Features** (`features.py`): 29 behavioral numerics (message counts, ratios, response latency,
intent-keyword flags, time-of-day, calls, from-ad) + 4 categoricals (`cat_brand/model/city/source`).
**Anti-leakage:** the LLM's interest/buy *judgment* is never a feature (that's the target);
brand/model/city are facts, so they are allowed. `normalize_brand/model/city` are shared by
train and serve so categories never drift. CatBoost handles NaN numerics + unseen categories.
**Retrain later** on real `dispositions.category=won/lost` once production logs them.

## Rules classifier (ported OTO framework)

- 10 validated Indonesian car-buying intent categories (Price/Financing, Promo, Test Drive,
  Booking, Visit/Showroom, Stock, Specs/Variant, Trade-in, Documents, Strong/Closing) +
  Model/Brand interest, mined from real SmartKonek chat data.
- Strong intent → `spk`/`appointment` stage + hot; considering-tier → `qualified` + warm;
  off-topic (job seekers replying to driver-recruitment ads) → `off_topic`/cold.
- `is_trivial(text)` flags filler/ack/emoji to skip the LLM. Per-lead, not per-message.
- `detect_junk(msgs)` (FR-34, rules-only, high-precision) flags off_topic/abusive/spam → a
  structured `lost_reason` (enum `LOST_REASONS`, 18 values incl. `bought_other_brand`,
  `out_of_area`, `spam_junk`, `job_seeker` + a `did_purchase` split). Built + Docker-tested;
  **not yet wired** — wiring auto-sets `disposition=spam|lost`+`lost_reason` (confidence-gated,
  reversible, never overrides human; BR-44) and needs a `spam` disposition seed + a
  `conversations.did_purchase` migration. Spam is excluded from conversion math.
> NOTE: classifier stage keys are being reconciled to the seeded action funnel
> (new→…→delivered) — see [02](02-business-rules.md) BR-14.

## Follow-up generator (`handle_followup`)

Triggered by the gateway cron (BR-18), not by inbound. Loads the last ~8 messages and calls
`llm.draft_followup` (reply-only, no extraction) → publishes an outbound `sender_type=bot`.
The outbound stamps `last_agent_message_at`, so it won't re-fire until the customer replies.

## LLM abstraction (`llm.py`)

- Providers: **`mock`** (deterministic, offline, no key) and **`anthropic`** (Claude Messages
  API, prompt caching on the static instruction prefix). Chat is Anthropic-only; GPT is NOT
  wired for chat.
- Two focused entry points (no shared mega-prompt):
  - `analyze(system_prompt, history, user_message, model)` → `{car_brand, car_model, city,
    purchase_timeframe, lost_reason, summary, priority, recommended_action, action_reason,
    action_confidence}`. No chat reply.
  - `draft_followup(...)` → a single follow-up `reply` string.
- Token `usage` (in/out/cache_read/cache_write) is logged per call.
- Config: `LLM_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, `LLM_MODEL` (default `claude-sonnet-4-6`).

## RAG & knowledge base

- `knowledge` service: `POST /ingest` → chunk → embed → `knowledge_chunks` (pgvector).
- `rag.retrieve` does cosine search with a min-score threshold.
- **Embeddings:** now `EMBED_PROVIDER=openai` (`text-embedding-3-small`, 1536-dim). Switching
  from the old `local` hashing means any previously-embedded KB must be **re-embedded** (different
  vector space). GPT key powers ONLY embeddings, never chat.
- **The KB does not auto-learn (BR-19).** `knowledge_chunks` is written only by explicit ingest.

## KB distillation pipeline

`scripts/distill_kb.py` mines historical **agent** replies (SmartKonek export) into curated
facts (`--analyze` → candidates, `--distill` → Haiku structured facts, `--ingest` TODO). Run in
Docker. Prices/stock go stale → human review before ingest.

## History & cost notes

- An RAG+LLM **auto-reply** engine existed and was **removed** (BR-17). Don't add it back.
- `ai_runs` records invocations for observability + future training data.
- CatBoost (`catboost==1.2.7`) requires **numpy<2** (pinned `numpy==1.26.4`); the Dockerfile
  installs `libgomp1`. Model artifact is `models/lead_score.cbm`; `lead_score.py` is a graceful
  no-op until it exists.
