"""Next Best Action (NBA) — the decision layer.

Turns SimpulX from "here's a lead" into "here's a lead AND the next step to close
it". Per the product vision the DECISION is made by rules over signals, NOT by an
LLM (the LLM only writes language). NBA consumes signals already computed on the
conversation — interest_level (classifier), closing_probability (CatBoost),
lead_score (CatBoost), the handoff flag, lead field completeness, and recency — and
emits ONE business-facing recommendation plus a priority the inbox sorts by.

Action vocabulary (from the vision):
  escalate          - hand a hot / high-closing lead to a human NOW
  offer_test_drive  - concrete next step for a warm+ automotive lead with a model
  ask_qualification - a warm lead is missing a key field; collect it
  continue_nurture  - keep the AI conversation going
  schedule_follow_up- lead went quiet / is cold; time a follow-up
  wait              - nothing to do yet

Deterministic + cheap: no network, no LLM, safe to run on every inbound after the
scores are written. Silent-safe: any missing signal degrades gracefully.
"""
from __future__ import annotations

from typing import Optional, Tuple

# priority: higher = surface higher in the inbox / more urgent for a human.
_PRIORITY = {
    "escalate": 90,
    "offer_test_drive": 70,
    "ask_qualification": 55,
    "continue_nurture": 40,
    "schedule_follow_up": 30,
    "wait": 10,
}

# Fields that qualify a lead enough to push a concrete next step. Segment-neutral
# core; automotive adds model. Kept small on purpose.
_KEY_FIELDS = ("city", "model", "brand", "purchase_timeframe")

STALE_HOURS = 24.0  # no genuine inbound for this long => time a follow-up


def decide(
    interest: Optional[str],
    ready_for_handoff: bool,
    closing_prob: Optional[float],
    lead_score: Optional[float],
    lead_fields: Optional[dict],
    hours_since_inbound: Optional[float],
    is_bot_active: bool,
) -> Tuple[str, str]:
    """Pure decision function. Returns (action, reason). Reason is a short human
    sentence for the agent, in Bahasa Indonesia (matches the product's UI copy)."""
    interest = (interest or "").lower()
    lf = lead_fields if isinstance(lead_fields, dict) else {}
    cp = closing_prob if isinstance(closing_prob, (int, float)) else None
    has_model = bool(lf.get("model") or lf.get("brand"))
    missing = [k for k in _KEY_FIELDS if not lf.get(k)]

    # 1. Ready for a human: explicit handoff, or a hot lead the model rates likely
    #    to close. This is the "sales only gets qualified/hot leads" promise.
    if ready_for_handoff or not is_bot_active:
        return "escalate", "Lead minta lanjut / sudah di-handoff. Ambil alih sekarang."
    if interest == "hot" or (cp is not None and cp >= 70):
        return "escalate", "Lead panas / peluang closing tinggi. Eskalasi ke sales."

    # 2. Warm lead with a concrete model in hand: push the next real step.
    if interest == "warm" and has_model and not missing:
        return "offer_test_drive", "Lead warm & data lengkap. Tawarkan test drive / jadwal."

    # 3. Warm but missing a qualifier: collect it before pushing.
    if interest == "warm" and missing:
        return "ask_qualification", f"Lead warm, lengkapi dulu: {', '.join(missing[:2])}."

    # 4. Quiet lead that isn't cold: time a follow-up before it goes cold.
    if hours_since_inbound is not None and hours_since_inbound >= STALE_HOURS and interest != "cold":
        return "schedule_follow_up", "Lead diam >24 jam. Jadwalkan follow-up."

    # 5. Cold: low-touch automation cadence, don't burn a human on it.
    if interest == "cold":
        return "schedule_follow_up", "Lead cold. Cukup follow-up otomatis terjadwal."

    # 6. Engaged warm/unknown with room to qualify: keep nurturing.
    if is_bot_active:
        return "continue_nurture", "AI masih menggali kebutuhan. Lanjut nurture."

    return "wait", "Belum ada sinyal cukup. Tunggu balasan lead."


def priority_of(action: str) -> int:
    return _PRIORITY.get(action, 10)


async def score_and_update(pool, conv_id: str, log=None) -> Optional[str]:
    """Compute the NBA from the conversation's current signals and persist it.
    Runs after lead_score + closing_score so it sees the freshest scores."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT interest_level, is_bot_active, handoff_at,
                      lead_score, closing_probability,
                      COALESCE(metadata,'{}'::jsonb) AS metadata,
                      last_contact_message_at
                 FROM conversations WHERE id = $1""",
            conv_id,
        )
    if row is None:
        return None

    import json
    md = row["metadata"]
    if isinstance(md, str):
        try:
            md = json.loads(md)
        except Exception:
            md = {}
    lf = (md or {}).get("lead_fields") if isinstance(md, dict) else {}
    if isinstance(lf, str):
        try:
            lf = json.loads(lf)
        except Exception:
            lf = {}

    hours = None
    if row["last_contact_message_at"] is not None:
        from datetime import datetime, timezone
        delta = datetime.now(timezone.utc) - row["last_contact_message_at"]
        hours = delta.total_seconds() / 3600.0

    action, reason = decide(
        interest=row["interest_level"],
        ready_for_handoff=row["handoff_at"] is not None,
        closing_prob=float(row["closing_probability"]) if row["closing_probability"] is not None else None,
        lead_score=float(row["lead_score"]) if row["lead_score"] is not None else None,
        lead_fields=lf if isinstance(lf, dict) else {},
        hours_since_inbound=hours,
        is_bot_active=bool(row["is_bot_active"]),
    )

    async with pool.acquire() as conn:
        await conn.execute(
            """UPDATE conversations SET
                 next_best_action = $2, nba_reason = $3,
                 nba_priority = $4, nba_at = now()
               WHERE id = $1""",
            conv_id, action, reason, priority_of(action),
        )
    if log:
        log.info("nba computed", extra={"conv": conv_id, "action": action})
    return action
