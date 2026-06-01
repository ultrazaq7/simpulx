"""Orkestrasi AI agent. AI di Simpulx TIDAK membalas chat otomatis (smart-reply
dihapus). Pada pesan masuk, AI hanya: (1) meng-klasifikasi lead via rule
classifier (interest hot/warm/cold + stage), dan (2) mengekstrak field prospek
(brand/model/kota/timeframe/lost_reason) untuk kualifikasi & analitik. Pembuatan
pesan follow-up ditangani handle_followup (dipicu cron berbasis waktu).
"""
from __future__ import annotations

import json
from typing import List

from simpulx_common import llm

from classifier import classify

SUBJECT_OUTBOUND = "events.message.outbound"


async def handle_inbound(broker, pool, env: dict, data: dict, log) -> None:
    """Proses satu pesan masuk: klasifikasi lead + ekstraksi field prospek.
    Tidak ada auto-reply. Raise pada error transien (agar di-redeliver)."""
    org_id = env["org_id"]
    conv_id = data["conversation_id"]
    message_id = data.get("message_id")
    body = (data.get("body") or "").strip()
    if not body:
        return  # no text to process (e.g. media without caption)

    # Classify the lead from the conversation (auto-CRM): interest level,
    # pipeline stage, and off-topic disposition - reps rarely set these by hand.
    await classify_and_update(pool, org_id, conv_id, log)

    async with pool.acquire() as conn:
        conv = await conn.fetchrow(
            """SELECT cv.is_bot_active, cv.ai_agent_id, a.system_prompt, a.model
                 FROM conversations cv
                 LEFT JOIN ai_agents a ON a.id = cv.ai_agent_id
                WHERE cv.id = $1""",
            conv_id,
        )

    if conv is None or conv["ai_agent_id"] is None:
        return  # belum punya agent AI -> tidak ada ekstraksi

    system_prompt = conv["system_prompt"] or "You are a helpful support assistant."

    # LLM extraction of prospect fields for qualification + lost analytics.
    # SMART-REPLY REMOVED: the AI never sends a reply to the customer here. We
    # only mine the chat for structured fields (no RAG needed). interest_level
    # stays owned by the free rule classifier above (hot/warm/cold).
    history = await _load_history(pool, conv_id, message_id)
    result = await llm.generate(system_prompt, [], history, body, model=conv["model"])

    ptf = result.get("purchase_timeframe")
    ptf_str = f"{ptf} days" if ptf is not None else None

    async with pool.acquire() as conn:
        await conn.execute(
            """UPDATE conversations SET
                 car_brand = COALESCE($2, car_brand),
                 car_model = COALESCE($3, car_model),
                 city = COALESCE($4, city),
                 purchase_timeframe = COALESCE($5, purchase_timeframe),
                 lost_reason = COALESCE($6, lost_reason)
               WHERE id = $1""",
            conv_id,
            result.get("car_brand"),
            result.get("car_model"),
            result.get("city"),
            ptf_str,
            result.get("lost_reason"),
        )
    log.info("lead extracted", extra={"conv": conv_id})


async def handle_followup(broker, pool, org_id: str, conv_id: str, log) -> None:
    """Proses pembuatan auto-followup message jika idle 4 jam."""
    async with pool.acquire() as conn:
        conv = await conn.fetchrow(
            """SELECT cv.is_bot_active, cv.ai_agent_id,
                      a.system_prompt, a.model
                 FROM conversations cv
                 LEFT JOIN ai_agents a ON a.id = cv.ai_agent_id
                WHERE cv.id = $1""",
            conv_id,
        )

    if conv is None or not conv["is_bot_active"] or conv["ai_agent_id"] is None:
        return

    system_prompt = conv["system_prompt"] or "You are a helpful support assistant."
    system_prompt += "\n\nINSTRUKSI KHUSUS: Ini adalah AUTO FOLLOW-UP. Buatkan pesan follow-up yang natural, singkat, tidak memaksa, dan ramah seperti sales mobil profesional yang menanyakan kelanjutan ketertarikan lead. Tanya apakah ada pertanyaan lebih lanjut."

    history = await _load_history(pool, conv_id, None)
    result = await llm.generate(
        system_prompt, [], history,
        "Tolong buatkan pesan follow-up untuk customer ini.",
        model=conv["model"],
    )

    reply = (result.get("reply") or "").strip()
    if reply:
        await broker.publish(SUBJECT_OUTBOUND, org_id, {
            "conversation_id": conv_id,
            "sender_type": "bot",
            "type": "text",
            "body": reply,
        })
        # The outbound path (insertOutbound) stamps last_agent_message_at=now()
        # for this bot message, so the 4h cron rule won't re-fire until the
        # customer replies again. No extra write needed here.
        log.info("ai followup sent", extra={"conv": conv_id})


async def classify_and_update(pool, org_id: str, conv_id: str, log) -> None:
    """Run the rules-based lead classifier over all the customer's messages and
    write interest level + stage + (off-topic) disposition onto the conversation."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT body FROM messages
                WHERE conversation_id = $1 AND direction = 'inbound' AND sender_type = 'contact'
                  AND body IS NOT NULL AND body <> ''
                  AND COALESCE(genuine, true)  -- skip ad/referral/Web-API template openers
                ORDER BY created_at""",
            conv_id,
        )
    msgs = [r["body"] for r in rows]
    if not msgs:
        return

    c = classify(msgs)

    async with pool.acquire() as conn:
        stage_id = await conn.fetchval(
            "SELECT id FROM stages WHERE organization_id = $1 AND system_key = $2", org_id, c["stage_key"]
        )
        disp_id = None
        if c["disposition_key"]:
            disp_id = await conn.fetchval(
                "SELECT id FROM dispositions WHERE organization_id = $1 AND system_key = $2",
                org_id, c["disposition_key"],
            )
        await conn.execute(
            """UPDATE conversations SET
                 interest_level = $2,
                 ai_stage = $3,
                 stage_id = COALESCE($4, stage_id),
                 disposition_id = COALESCE(disposition_id, $5),  -- keep human-set disposition
                 ai_reason = $6,
                 ai_confidence = $7,
                 ai_analyzed_at = now(),
                 metadata = metadata || jsonb_build_object('intent_categories', $8::jsonb),
                 updated_at = now()
               WHERE id = $1 AND classification_locked = false""",
            conv_id, c["interest"], c["stage_key"], stage_id, disp_id,
            c["reason"], c["confidence"], json.dumps(c["categories"]),
        )
    log.info("lead classified", extra={"conv": conv_id, "interest": c["interest"], "stage": c["stage_key"]})


async def _load_history(pool, conv_id: str, exclude_message_id) -> List[dict]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT direction, body FROM messages
                WHERE conversation_id = $1 AND ($2::uuid IS NULL OR id <> $2::uuid)
                  AND body IS NOT NULL AND body <> ''
                ORDER BY created_at DESC LIMIT 10""",
            conv_id, exclude_message_id,
        )
    msgs = []
    for r in reversed(rows):
        role = "user" if r["direction"] == "inbound" else "assistant"
        msgs.append({"role": role, "content": r["body"]})
    return msgs
