"""Write one llm_usage row per Anthropic call.

Lives here (not in simpulx_common.llm) because llm.py has no DB pool: llm.py fills
a usage dict, the caller — which owns the pool and knows the org/conversation —
records it. See db/migrations/0095_llm_usage.sql for why the table never cascades.

Recording is BEST EFFORT: a failure here must never break a customer reply, so
record() swallows everything. Losing a cost row is cheap; losing a reply is not.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional

# 'followup' is a 6th label beyond the original spec's five: llm.draft_followup
# (scheduled auto follow-up) is a different call from llm.nurture (live auto-reply)
# — different instruction, different max_tokens (256 vs 400). Merging them into
# 'nurture' would be unrecoverable once rows are written, so they stay separate.
FEATURES = ("extract", "nurture", "followup", "summary", "reply", "catalog")

# USD per 1M tokens: model id prefix -> (input, output). Longest prefix wins, so a
# dated id ('claude-sonnet-5-20260514') resolves via its family prefix.
#
# NOT authoritative and NOT load-bearing: an unknown or mispriced model still gets
# its token counts stored, and cost_usd is recomputable from those with an UPDATE.
# The model is resolved from the Models API at runtime (llm.latest_sonnet_model),
# so a model can appear here that this table has never heard of -> cost_usd NULL.
_PRICES = {
    "claude-opus-4-8": (5.00, 25.00),
    "claude-opus-4-7": (5.00, 25.00),
    "claude-opus-4-6": (5.00, 25.00),
    "claude-sonnet-5": (3.00, 15.00),
    "claude-sonnet-4-6": (3.00, 15.00),
    "claude-haiku-4-5": (1.00, 5.00),
}

# Sonnet 5 launched on introductory pricing that reverts to the _PRICES rate after
# this date. Cost is priced as of the call, so rows written before the cutoff keep
# the intro rate and rows after it keep the standard rate — which is what actually
# got billed. Delete this block once the date has passed.
_SONNET5_INTRO = (2.00, 10.00)
_SONNET5_INTRO_UNTIL = date(2026, 8, 31)

# Anthropic cache multipliers, relative to the model's INPUT price.
# Writes use the 5-minute ephemeral TTL (llm.py sets cache_control type=ephemeral
# with no ttl) -> 1.25x. A 1h TTL would be 2.0x.
_CACHE_READ_MULT = 0.10
_CACHE_WRITE_MULT = 1.25


def _rate(model: str, at: date) -> Optional[tuple[float, float]]:
    """(input, output) USD per 1M tokens for `model` as of date `at`, or None if
    the model is unknown — in which case cost_usd is left NULL rather than wrong."""
    m = model or ""
    match = max((p for p in _PRICES if m.startswith(p)), key=len, default=None)
    if match is None:
        return None
    if match == "claude-sonnet-5" and at <= _SONNET5_INTRO_UNTIL:
        return _SONNET5_INTRO
    return _PRICES[match]


def cost_usd(model: str, tokens_in: int, tokens_out: int,
             cache_read: int, cache_write: int, at: Optional[date] = None) -> Optional[float]:
    """Best-effort USD cost of one call. None when the model isn't priced here.

    tokens_in is the UNCACHED input remainder: Anthropic reports cache reads and
    cache writes as separate counters, so summing all four is correct, not double
    counting."""
    rate = _rate(model, at or date.today())
    if rate is None:
        return None
    rin, rout = rate
    return (
        tokens_in * rin
        + tokens_out * rout
        + cache_read * rin * _CACHE_READ_MULT
        + cache_write * rin * _CACHE_WRITE_MULT
    ) / 1_000_000


def _as_int(v) -> int:
    try:
        return int(v or 0)
    except (TypeError, ValueError):
        return 0


def _to_numeric(v: Optional[float]) -> Optional[Decimal]:
    """asyncpg binds `numeric` params as Decimal and rejects a bare float, so the
    float->Decimal hop happens here, at the DB boundary, and cost_usd() stays a
    plain testable calculation. Quantized to the column's numeric(12,6) scale."""
    if v is None:
        return None
    return Decimal(str(v)).quantize(Decimal("0.000001"))


_INSERT = """INSERT INTO llm_usage (organization_id, conversation_id, feature, model,
                                    tokens_in, tokens_out, cache_read, cache_write, cost_usd)
             VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9)"""


async def record(pool, org_id: str, conversation_id, feature: str,
                 usage: Optional[dict], log, conn=None) -> None:
    """Insert one llm_usage row from llm.py's usage_out dict.

    `usage` is {model, input_tokens, output_tokens, cache_read_input_tokens,
    cache_creation_input_tokens} — an empty/None dict means the call never reached
    Anthropic (mock provider, or it raised), so there is nothing to bill and we
    write nothing. Never raises.

    `conn` reuses a connection the caller already holds (same idiom as
    orchestrator._conn_or). Pass it from any path that is holding one — notably
    under _conv_reply_lock, where acquiring a second connection would make each
    nurture occupy two of the pool's 8 slots and halve reply concurrency."""
    try:
        if not usage or not usage.get("model"):
            return
        model = str(usage["model"])
        tin = _as_int(usage.get("input_tokens"))
        tout = _as_int(usage.get("output_tokens"))
        cread = _as_int(usage.get("cache_read_input_tokens"))
        cwrite = _as_int(usage.get("cache_creation_input_tokens"))
        args = (org_id, conversation_id, feature, model, tin, tout, cread, cwrite,
                _to_numeric(cost_usd(model, tin, tout, cread, cwrite)))
        if conn is not None:
            await conn.execute(_INSERT, *args)
        else:
            async with pool.acquire() as c:
                await c.execute(_INSERT, *args)
    except Exception:  # noqa: BLE001
        # Cost telemetry must never take down a reply path.
        log.exception("llm_usage record failed", extra={"feature": feature})
