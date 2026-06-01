# 15 — AI Engine

Simpulx's AI does three things: **classify** leads, **extract** structured fields, and
**draft follow-ups**. It deliberately does **NOT** auto-reply to customers (BR-17).
Source: `services/ai-agent/` + `libs/python/simpulx_common/llm.py`.

## Components

| Component | File | Role | Cost |
|---|---|---|---|
| Rules classifier | `ai-agent/classifier.py` | interest level + stage + off-topic | free, instant |
| Field extractor | `llm.py` (`generate`) | brand/model/city/timeframe/lost_reason | LLM call |
| Follow-up generator | `orchestrator.py handle_followup` | human-sounding 4h follow-up | LLM call |
| RAG retrieval | `ai-agent/rag.py` | pgvector cosine search over KB | free (local embed) |
| Embeddings | `simpulx_common/embeddings.py` | local hashing OR OpenAI | free / paid |
| LLM provider | `simpulx_common/llm.py` | `anthropic` or `mock` | paid / free |

## On inbound (`handle_inbound`)

No reply is ever sent. The handler:
1. `classify_and_update` — runs the **rules classifier** over the contact's *genuine*
   inbound messages → writes `interest_level`, `ai_stage`, `stage_id`, disposition,
   reason, confidence. Respects `classification_locked` (never overwrites a human).
2. LLM **extraction** — one `llm.generate` call returns structured fields
   (`car_brand, car_model, city, purchase_timeframe, lost_reason`) which are COALESCE-d
   onto the conversation. (No RAG, no customer-facing text.)

## Rules classifier (ported OTO framework)

- 10 validated Indonesian car-buying intent categories (Price/Financing, Promo, Test
  Drive, Booking, Visit/Showroom, Stock, Specs/Variant, Trade-in, Documents,
  Strong/Closing) + Model/Brand interest, mined from real SmartKonek chat data.
- Strong intent → `high_intent`/`closing` stage + hot; considering-tier → `considering` +
  warm; off-topic (job seekers replying to driver-recruitment ads) → `off_topic`/cold.
- Per-lead, not per-message; deterministic and free. The LLM only refines/extracts.
> NOTE: the seeded DB funnel is now the action funnel (new→…→delivered). The classifier's
> intent-based stage keys are being reconciled to the action funnel — see [02](02-business-rules.md) BR-14.

## Follow-up generator (`handle_followup`)

Triggered by the gateway cron (BR-18), not by inbound. Loads the last ~10 messages, adds
a system instruction to write a natural, non-pushy car-sales follow-up, calls
`llm.generate`, and publishes an outbound `sender_type=bot`. The outbound stamps
`last_agent_message_at`, so it won't re-fire until the customer replies again.

## LLM abstraction (`llm.py`)

- Providers: **`mock`** (deterministic, offline, no key) and **`anthropic`** (Claude
  Messages API with **prompt caching** on the system+context block).
- Output is a strict JSON contract: `{reply, confidence, need_human, car_brand,
  car_model, city, purchase_timeframe, interest_level, lost_reason}`; safe fallback parse
  if the model returns prose.
- Config: `LLM_PROVIDER`, `ANTHROPIC_API_KEY`, `LLM_MODEL` (default `claude-haiku-4-5`).

## RAG & knowledge base

- `knowledge` service: `POST /ingest` → chunk → embed → `knowledge_chunks` (pgvector).
- `rag.retrieve` does cosine search with a min-score threshold.
- **Embeddings:** default `EMBED_PROVIDER=local` (deterministic hashing — keyword-level,
  good for dev). Set `openai` for true semantic retrieval.
- **The KB does not auto-learn (BR-19).** `knowledge_chunks` is written only by explicit
  ingest. Customer questions are NOT knowledge.

## KB distillation pipeline

`scripts/distill_kb.py` mines historical **agent** replies (SmartKonek export) into
curated facts:
1. `--analyze`: keep agent (Outgoing) replies, drop filler + `*POST VIEWED*` ad
   templates + URLs, dedupe → candidates.
2. `--distill`: batch to Claude Haiku → structured facts `{dealer, brand, model,
   category, fact, needs_verification}`, prices flagged for verification.
3. (TODO) `--ingest`: POST approved facts to knowledge `/ingest`.
Run in Docker (no local Python). Prices/stock go stale → human review before ingest.

## History & cost

- An RAG+LLM **auto-reply** engine existed and was **removed** per product decision
  (BR-17). Remnant: `events.conversation.handoff` subject still exists.
- `ai_runs` records every invocation (input, retrieved chunks, output, decision,
  confidence, model, latency) for observability + future fine-tuning data.
- A full distill run on the OTO export (~112k rows → ~2.4k clean facts) cost <$1 on
  Haiku; mind the Anthropic rate limit (429s) — batch with backoff.
