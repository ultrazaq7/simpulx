"""Orkestrasi engagement assistant. TIDAK membalas chat otomatis. Pada pesan
masuk: (1) klasifikasi lead via rule classifier (0 token, tiap pesan),
(2) skor potensi beli (CatBoost, tiap pesan), (3) ekstraksi field + ringkasan +
saran follow-up via LLM - tapi HANYA saat ada perubahan berarti (hemat token).
Pesan follow-up ditangani handle_followup (cron berbasis waktu).
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import List, Optional

from simpulx_common import llm

from classifier import classify, is_trivial, STRONG_INTENT, detect_junk
import lead_score
import segments

SUBJECT_OUTBOUND = "events.message.outbound"
SUBJECT_AI_ACTIVITY = "events.ai.activity"  # live Simpuler phase for the inbox (WS-C)

COOLDOWN_SEC = 45          # burst debounce: max ~1 LLM analyze per conversation / 45s
JUNK_CONF = 0.7            # min detect_junk() confidence to auto-set spam/lost (FR-34/BR-44)
GHOST_FOLLOWUPS = 3        # after this many touches with no genuine reply -> ghosted (FR-34); sends 2 touches, ghosts on the 3rd
_ENTITY_CATS = {"Model/Brand Interest", "Price/Financing", "Visit/Showroom"}


async def _publish_activity(broker, org_id: str, conv_id: str, phase: str, log) -> None:
    """Emit a live Simpuler phase (thinking|replied|handoff) for the inbox. Best
    effort: a transient indicator must never break the reply flow."""
    try:
        await broker.publish(SUBJECT_AI_ACTIVITY, org_id, {"conversation_id": conv_id, "phase": phase})
    except Exception:  # noqa: BLE001
        log.debug("ai activity publish failed", extra={"conv": conv_id})


async def handle_inbound(broker, pool, env: dict, data: dict, log) -> None:
    """Proses satu pesan masuk. Raise pada error transien (agar di-redeliver)."""
    org_id = env["org_id"]
    conv_id = data["conversation_id"]
    message_id = data.get("message_id")
    body = (data.get("body") or "").strip()
    if not body:
        return  # no text to process (e.g. media without caption)

    # (1) Rules classifier (0 token) — fast, and needed by the auto-reply gate.
    cr = await classify_and_update(pool, org_id, conv_id, log)

    # (2) AI auto-reply nurture FIRST so the customer-facing reply isn't blocked by
    # scoring/extraction below. Only fires when the campaign opted in; never raises.
    try:
        await maybe_nurture(broker, pool, org_id, conv_id, message_id, body, cr, log)
    except Exception:  # noqa: BLE001
        log.exception("nurture failed", extra={"conv": conv_id})

    # (3) Buy-potential score (CatBoost) — AFTER the reply so it never adds latency
    # to it, but still keeps the CRM live even when the LLM extraction is skipped.
    await lead_score.score_and_update(pool, conv_id, log)

    async with pool.acquire() as conn:
        conv = await conn.fetchrow(
            """SELECT cv.ai_agent_id, cv.ai_extracted_at,
                      cv.car_brand, cv.car_model, cv.city, cv.purchase_timeframe,
                      cmp.segment,
                      a.system_prompt, a.model
                 FROM conversations cv
                 LEFT JOIN ai_agents a ON a.id = cv.ai_agent_id
                 LEFT JOIN campaigns cmp ON cmp.id = cv.campaign_id
                WHERE cv.id = $1""",
            conv_id,
        )
    if conv is None or conv["ai_agent_id"] is None:
        return  # belum punya assistant -> tidak ada ekstraksi

    # (3) Gate the expensive LLM call: only on meaningful change.
    run, reason = _should_analyze(cr, conv, body)
    if not run:
        log.info("llm skipped", extra={"conv": conv_id, "reason": reason})
        await broker.publish("events.conversation.updated", org_id, {"conversation_id": conv_id})
        return

    system_prompt = conv["system_prompt"] or "You are a helpful sales assistant."
    history = await _load_history(pool, conv_id, message_id)
    # Non-automotive segments also extract their own qualifier fields (WS-B).
    # extra_fields is empty for automotive/unset -> analyze() is unchanged.
    extra_fields = segments.extra_fields_for(conv["segment"])
    result = await llm.analyze(system_prompt, history, body, model=conv["model"], extra_fields=extra_fields)

    ptf = result.get("purchase_timeframe")
    ptf_str = f"{ptf} days" if ptf is not None else None

    async with pool.acquire() as conn:
        await conn.execute(
            """UPDATE conversations SET
                 car_brand = COALESCE($2, car_brand),
                 car_model = COALESCE($3, car_model),
                 city = COALESCE($4, city),
                 purchase_timeframe = COALESCE($5, purchase_timeframe),
                 lost_reason = COALESCE($6, lost_reason),
                 -- Advisory summary/next-step (latest message wins; null keeps prior).
                 lead_summary = COALESCE($7, lead_summary),
                 lead_priority = COALESCE($8, lead_priority),
                 suggested_action = COALESCE($9, suggested_action),
                 suggested_action_reason = COALESCE($10, suggested_action_reason),
                 suggested_action_confidence = COALESCE($11, suggested_action_confidence),
                 ai_extracted_at = now()
               WHERE id = $1""",
            conv_id,
            result.get("car_brand"), result.get("car_model"), result.get("city"),
            ptf_str, result.get("lost_reason"),
            result.get("summary"), result.get("priority"),
            result.get("recommended_action"), result.get("action_reason"),
            result.get("action_confidence"),
        )
    # Merge non-automotive qualifier fields into metadata.lead_fields (best effort).
    lead_fields = result.get("fields") if extra_fields else None
    if lead_fields:
        try:
            async with pool.acquire() as conn:
                await conn.execute(
                    """UPDATE conversations
                          SET metadata = COALESCE(metadata,'{}'::jsonb)
                              || jsonb_build_object('lead_fields',
                                   COALESCE(metadata->'lead_fields','{}'::jsonb) || $2::jsonb)
                        WHERE id = $1""",
                    conv_id, json.dumps(lead_fields),
                )
        except Exception:  # noqa: BLE001
            log.exception("lead_fields write failed", extra={"conv": conv_id})
    log.info("lead analyzed", extra={"conv": conv_id, "reason": reason})
    await broker.publish("events.conversation.updated", org_id, {"conversation_id": conv_id})


def _should_analyze(cr: Optional[dict], conv, body: str) -> tuple[bool, str]:
    """Decide whether to spend an LLM call. Skip filler/off-topic/no-change, and
    debounce message bursts via the cooldown."""
    if cr is None:
        return False, "no_signal"        # only ad/template opener so far
    if cr.get("is_junk"):
        return False, "junk"             # spam/abusive/off-topic -> don't spend an LLM call
    if cr["off_topic"]:
        return False, "off_topic"
    if is_trivial(body):
        return False, "trivial"
    last = conv["ai_extracted_at"]
    if last is None:
        return True, "first"             # never analyzed -> do it
    if (datetime.now(timezone.utc) - last).total_seconds() < COOLDOWN_SEC:
        return False, "cooldown"
    if cr["changed"]:
        return True, "changed"
    if cr["new_strong_intent"]:
        return True, "new_strong_intent"
    missing = any(conv[f] is None for f in ("car_brand", "car_model", "city", "purchase_timeframe"))
    if missing and any(c in _ENTITY_CATS for c in cr["categories"]):
        return True, "fill_fields"
    return False, "no_change"


async def handle_followup(broker, pool, org_id: str, conv_id: str, log) -> None:
    """Buat satu pesan auto-followup jika idle 4 jam."""
    async with pool.acquire() as conn:
        conv = await conn.fetchrow(
            """SELECT cv.is_bot_active, cv.ai_agent_id, cv.followup_count,
                      cv.car_brand, cv.car_model, cv.city, cv.window_expires_at,
                      a.system_prompt, a.model
                 FROM conversations cv
                 LEFT JOIN ai_agents a ON a.id = cv.ai_agent_id
                WHERE cv.id = $1""",
            conv_id,
        )
    if conv is None or not conv["is_bot_active"] or conv["ai_agent_id"] is None:
        return

    # Ghost / non-responder (FR-34): after >= GHOST_FOLLOWUPS follow-ups with NO genuine
    # customer reply, this was never a real lead -> quarantine as spam/ghosted + stop the
    # bot. Reversible; keeps a human-set disposition; respects classification_locked.
    if (conv["followup_count"] or 0) >= GHOST_FOLLOWUPS:
        async with pool.acquire() as conn:
            genuine = await conn.fetchval(
                """SELECT count(*) FROM messages
                    WHERE conversation_id = $1 AND direction = 'inbound'
                      AND sender_type = 'contact' AND COALESCE(genuine, true)
                      AND body IS NOT NULL AND body <> ''""",
                conv_id,
            )
        if genuine == 0:
            async with pool.acquire() as conn:
                spam_id = await conn.fetchval(
                    "SELECT id FROM dispositions WHERE organization_id = $1 AND system_key = 'spam'",
                    org_id,
                )
                await conn.execute(
                    """UPDATE conversations SET
                         disposition_id = COALESCE(disposition_id, $2),
                         lost_reason = COALESCE(lost_reason, 'ghosted'),
                         interest_level = 'cold', is_bot_active = false, updated_at = now()
                       WHERE id = $1 AND classification_locked = false""",
                    conv_id, spam_id,
                )
            log.info("lead ghosted (no genuine reply)", extra={"conv": conv_id})
            return

    finance_ctx = ""
    if conv and conv["car_brand"] and conv["car_model"]:
        import finance_rag
        ctx = await finance_rag.get_finance_context(pool, conv["car_brand"], conv["car_model"], conv["city"])
        if ctx:
            finance_ctx = f"\n\n{ctx}\n"

    # WhatsApp only allows free-form messages inside the 24h service window.
    # Outside it a follow-up would need an approved template (not wired yet), so
    # skip the send rather than let it fail. The lead is left for a future reply.
    win = conv["window_expires_at"]
    if win is not None and win <= datetime.now(timezone.utc):
        log.info("followup skipped: outside 24h window", extra={"conv": conv_id})
        return

    system_prompt = (conv["system_prompt"] if conv and conv["system_prompt"] else "You are a helpful sales assistant.") + finance_ctx
    history = await _load_history(pool, conv_id, None)
    # Copy varies by touch number (gentle -> direct -> closing) so repeat nudges
    # don't read like the same message twice.
    reply = await llm.draft_followup(
        system_prompt, history,
        "Tolong buatkan pesan follow-up untuk customer ini.",
        model=conv["model"], touch=(conv["followup_count"] or 1),
    )
    if reply:
        await broker.publish(SUBJECT_OUTBOUND, org_id, {
            "conversation_id": conv_id, "sender_type": "bot",
            "type": "text", "body": reply,
        })
        # Outbound path stamps last_agent_message_at=now(), so the 4h cron won't
        # re-fire until the customer replies again.
        log.info("followup sent", extra={"conv": conv_id})


_LANG_NAMES = {"id": "Bahasa Indonesia", "en": "English"}
SUBJECT_NOTIFICATION = "events.notification.created"
SUBJECT_SEND_FORM = "events.cmd.send_form"
NURTURE_BURST_SEC = 20  # skip a fresh auto-reply if the bot just replied < this ago


async def maybe_nurture(broker, pool, org_id: str, conv_id: str, message_id, body: str, cr, log) -> None:
    """AI auto-reply nurture. Gated by the conversation's campaign (ai_auto_reply).
    Generates a context-aware reply, sends it, auto-sends the intake form on the
    first turn, and hands off to a human (stand down + notify) once the lead's key
    details are collected or the lead asks for a person / is ready to transact."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT cv.is_bot_active, cv.assigned_agent_id::text AS agent_id,
                      cv.campaign_id::text AS campaign_id,
                      cv.car_brand, cv.car_model, cv.city, cv.purchase_timeframe,
                      COALESCE(cv.metadata, '{}'::jsonb) AS metadata,
                      a.system_prompt, a.model,
                      cmp.ai_auto_reply, cmp.segment, cmp.brand, cmp.ai_language,
                      cmp.ai_dynamic_language, cmp.intake_form_id::text AS intake_form_id,
                      cmp.name AS campaign_name, cmp.dealer_name
                 FROM conversations cv
                 LEFT JOIN ai_agents a ON a.id = cv.ai_agent_id
                 LEFT JOIN campaigns cmp ON cmp.id = cv.campaign_id
                WHERE cv.id = $1""",
            conv_id,
        )
    if row is None or not row["ai_auto_reply"]:
        return  # campaign didn't opt into AI auto-reply
    if not row["is_bot_active"]:
        return  # bot already stood down (handed off / paused)
    if cr and (cr.get("is_junk") or cr.get("off_topic")):
        return  # don't auto-reply to spam / off-topic

    async with pool.acquire() as conn:
        # Human takeover: if a human (agent/user) already replied, stand down.
        human = await conn.fetchval(
            """SELECT count(*) FROM messages
                WHERE conversation_id = $1 AND direction = 'outbound'
                  AND sender_type NOT IN ('bot', 'system')""",
            conv_id,
        )
        if human and human > 0:
            await conn.execute("UPDATE conversations SET is_bot_active = false WHERE id = $1", conv_id)
            log.info("nurture stand down (human replied)", extra={"conv": conv_id})
            return
        # Burst guard: don't fire again if the bot just replied moments ago.
        recent_bot = await conn.fetchval(
            """SELECT count(*) FROM messages
                WHERE conversation_id = $1 AND direction = 'outbound' AND sender_type = 'bot'
                  AND created_at > now() - ($2 || ' seconds')::interval""",
            conv_id, str(NURTURE_BURST_SEC),
        )
    if recent_bot and recent_bot > 0:
        return

    # Credit gate (WS-F): if the campaign has a credit allocation and it's used up,
    # the AI stands down to a human (the lead is never dropped).
    async with pool.acquire() as conn:
        cc = await conn.fetchrow(
            """SELECT cc.allocated_credits, cc.used_credits
                 FROM campaign_credits cc
                 JOIN conversations cv ON cv.campaign_id = cc.campaign_id
                WHERE cv.id = $1""",
            conv_id,
        )
    if cc and cc["allocated_credits"] > 0 and cc["used_credits"] >= cc["allocated_credits"]:
        log.info("nurture skipped: campaign credits exhausted", extra={"conv": conv_id})
        await _ai_handoff(broker, pool, org_id, conv_id, row["agent_id"], log)
        return

    # Language rule (consistent, with optional dynamic matching to the contact).
    lang = (row["ai_language"] or "id").lower()
    lang_name = _LANG_NAMES.get(lang, "Bahasa Indonesia")
    if row["ai_dynamic_language"]:
        lang_rule = (f"Reply in the SAME language the customer is using. "
                     f"If it is unclear, default to {lang_name}.")
    else:
        lang_rule = f"Always reply in {lang_name}, regardless of the customer's language."

    # Campaign / brand context so replies stay on-brand and never sell competitors.
    ctx = ""
    if row["campaign_name"]:
        who = row["dealer_name"] or row["brand"] or "our business"
        ctx = f"\n\nYou are the sales assistant for {who}"
        if row["brand"]:
            ctx += f", product/brand: {row['brand']}"
        if row["segment"]:
            ctx += f" (industry: {row['segment']})"
        ctx += (f", on campaign '{row['campaign_name']}'. Only discuss what this business sells; "
                f"politely decline and refocus if asked about competitors.")

    finance_ctx = ""
    if row["car_brand"] and row["car_model"]:
        import finance_rag
        # Campaign-scoped catalog first (falls back to global finance_packages).
        fc = await finance_rag.get_catalog_context(pool, row["campaign_id"], row["car_brand"], row["car_model"], row["city"], row["segment"])
        if fc:
            finance_ctx = f"\n\n{fc}\n"

    system_prompt = (row["system_prompt"] or "You are a helpful sales assistant.") + ctx + "\n\n" + lang_rule + finance_ctx
    history = await _load_history(pool, conv_id, message_id)
    await _publish_activity(broker, org_id, conv_id, "thinking", log)
    result = await llm.nurture(system_prompt, history, body, model=row["model"])
    reply = (result.get("reply") or "").strip()
    if not reply:
        await _publish_activity(broker, org_id, conv_id, "replied", log)  # clear the indicator
        return

    meta = row["metadata"] if isinstance(row["metadata"], dict) else json.loads(row["metadata"] or "{}")
    first_turn = not meta.get("ai_nurture_started")

    # Send the reply.
    await broker.publish(SUBJECT_OUTBOUND, org_id, {
        "conversation_id": conv_id, "sender_type": "bot", "type": "text", "body": reply,
    })
    await _publish_activity(broker, org_id, conv_id, "replied", log)
    async with pool.acquire() as conn:
        await conn.execute(
            """UPDATE conversations
                  SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"ai_nurture_started": true}'::jsonb
                WHERE id = $1""",
            conv_id,
        )
    log.info("nurture replied", extra={"conv": conv_id, "handoff": result.get("ready_for_handoff")})

    # First turn: auto-send the campaign's intake form to collect full details.
    if first_turn and row["intake_form_id"]:
        await broker.publish(SUBJECT_SEND_FORM, org_id, {
            "conversation_id": conv_id, "form_id": row["intake_form_id"],
        })

    # Hand off once info is complete OR the model flagged readiness. "Complete"
    # is segment-aware (WS-B): automotive uses its native columns; other segments
    # check their required qualifier keys in metadata.lead_fields.
    if segments.is_automotive(row["segment"]):
        fields_done = all(row[f] is not None for f in ("car_model", "city", "purchase_timeframe"))
    else:
        req = segments.required_keys(row["segment"])
        lf = meta.get("lead_fields") or {}
        fields_done = bool(req) and all(lf.get(k) for k in req)
    if result.get("ready_for_handoff") or fields_done:
        await _ai_handoff(broker, pool, org_id, conv_id, row["agent_id"], log)


async def _ai_handoff(broker, pool, org_id: str, conv_id: str, agent_id, log) -> None:
    """Stand the bot down and notify a human that a nurtured lead is ready."""
    await _publish_activity(broker, org_id, conv_id, "handoff", log)
    async with pool.acquire() as conn:
        await conn.execute("UPDATE conversations SET is_bot_active = false, updated_at = now() WHERE id = $1", conv_id)
        recipients = [agent_id] if agent_id else [
            r["id"] for r in await conn.fetch(
                "SELECT id::text AS id FROM users WHERE organization_id = $1 AND status = 'active' AND role IN ('admin','owner','manager')",
                org_id,
            )
        ]
        title = "Lead ready for you"
        bodytext = "The AI assistant collected the details - this lead is warmed up and ready to handle."
        for uid in recipients:
            if not uid:
                continue
            await conn.execute(
                """INSERT INTO notifications (organization_id, user_id, type, title, body, conversation_id)
                   VALUES ($1, $2::uuid, 'ai_handoff', $3, $4, $5::uuid)""",
                org_id, uid, title, bodytext, conv_id,
            )
            await broker.publish(SUBJECT_NOTIFICATION, org_id, {
                "user_id": uid, "type": "ai_handoff", "title": title, "body": bodytext, "conversation_id": conv_id,
            })
    log.info("nurture handoff", extra={"conv": conv_id, "recipients": len(recipients)})


async def classify_and_update(pool, org_id: str, conv_id: str, log) -> Optional[dict]:
    """Rules classifier over the customer's messages -> writes interest/stage/
    disposition. Returns {interest, stage_key, categories, off_topic, changed,
    new_strong_intent} so the caller can gate the LLM (None if no genuine msg)."""
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
        return None

    async with pool.acquire() as conn:
        ad_clicks = await conn.fetchval(
            "SELECT count(*) FROM conversation_attributions WHERE conversation_id = $1", conv_id
        )
        prev = await conn.fetchrow(
            "SELECT interest_level, ai_stage, (metadata->'intent_categories') AS cats "
            "FROM conversations WHERE id = $1", conv_id,
        )

    c = classify(msgs, ad_clicks)
    junk = detect_junk(msgs)
    is_junk = junk["is_junk"] and junk["confidence"] >= JUNK_CONF

    # Junk override (FR-34/BR-44): high-precision rules -> cold + spam disposition +
    # lost_reason. COALESCE keeps any human-set disposition/lost_reason; reversible via UI.
    interest = "cold" if is_junk else c["interest"]
    disp_key = "spam" if is_junk else c["disposition_key"]
    reason = junk["reason"] if is_junk else c["reason"]
    confidence = junk["confidence"] if is_junk else c["confidence"]
    lost_reason = junk["lost_reason"] if is_junk else None

    # Diff vs stored classification -> drives the LLM gate.
    prev_cats = _as_list(prev["cats"]) if prev else []
    changed = (prev is None or prev["interest_level"] != interest
               or prev["ai_stage"] != c["stage_key"])
    new_strong_intent = any(cat in STRONG_INTENT and cat not in prev_cats for cat in c["categories"])

    async with pool.acquire() as conn:
        stage_id = await conn.fetchval(
            "SELECT id FROM stages WHERE organization_id = $1 AND system_key = $2", org_id, c["stage_key"]
        )
        disp_id = None
        if disp_key:
            disp_id = await conn.fetchval(
                "SELECT id FROM dispositions WHERE organization_id = $1 AND system_key = $2",
                org_id, disp_key,
            )
        await conn.execute(
            """UPDATE conversations SET
                 interest_level = $2,
                 ai_stage = $3,
                 stage_id = COALESCE($4, stage_id),
                 disposition_id = COALESCE(disposition_id, $5),  -- keep human-set disposition
                 lost_reason = COALESCE(lost_reason, $9),        -- junk reason; never overwrite
                 ai_reason = $6,
                 ai_confidence = $7,
                 ai_analyzed_at = now(),
                 metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('intent_categories', $8::jsonb),
                 classification_locked = CASE 
                     WHEN $10 = true THEN true  -- keep locked if it is junk
                     WHEN $2 IN ('warm', 'hot') THEN false -- unlock if there is real buying intent
                     ELSE classification_locked 
                 END,
                 updated_at = now()
               WHERE id = $1 AND (classification_locked = false OR $2 IN ('warm', 'hot'))""",
            conv_id, interest, c["stage_key"], stage_id, disp_id,
            reason, confidence, json.dumps(c["categories"]), lost_reason, is_junk,
        )
    log.info("lead classified", extra={"conv": conv_id, "interest": interest,
                                       "stage": c["stage_key"], "junk": is_junk})
    return {
        "interest": interest, "stage_key": c["stage_key"], "categories": c["categories"],
        "off_topic": c["off_topic"], "is_junk": is_junk, "changed": changed,
        "new_strong_intent": new_strong_intent,
    }


def _as_list(v) -> list:
    if not v:
        return []
    if isinstance(v, list):
        return v
    try:
        return json.loads(v)
    except Exception:  # noqa: BLE001
        return []


async def _load_history(pool, conv_id: str, exclude_message_id) -> List[dict]:
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT direction, body FROM messages
                WHERE conversation_id = $1 AND ($2::uuid IS NULL OR id <> $2::uuid)
                  AND body IS NOT NULL AND body <> ''
                ORDER BY created_at DESC LIMIT 8""",
            conv_id, exclude_message_id,
        )
    msgs = []
    for r in reversed(rows):
        role = "user" if r["direction"] == "inbound" else "assistant"
        msgs.append({"role": role, "content": r["body"]})
    return msgs
