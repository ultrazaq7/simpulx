"""Orkestrasi engagement assistant. TIDAK membalas chat otomatis. Pada pesan
masuk: (1) klasifikasi lead via rule classifier (0 token, tiap pesan),
(2) skor potensi beli (CatBoost, tiap pesan), (3) ekstraksi field + ringkasan +
saran follow-up via LLM - tapi HANYA saat ada perubahan berarti (hemat token).
Pesan follow-up ditangani handle_followup (cron berbasis waktu).
"""
from __future__ import annotations

import asyncio
import json
import re
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import List, Optional

from simpulx_common import llm

from classifier import classify, is_trivial, STRONG_INTENT, detect_junk
import lead_score
import segments


def _lead_fields(metadata) -> dict:
    """Extract metadata.lead_fields as a dict. asyncpg may hand back jsonb as a
    string (no codec registered), and lead_fields itself may be nested-stringified,
    so unwrap both defensively. Returns {} on anything unexpected."""
    m = metadata
    if isinstance(m, str):
        try:
            m = json.loads(m)
        except Exception:
            return {}
    if not isinstance(m, dict):
        return {}
    lf = m.get("lead_fields")
    if isinstance(lf, str):
        try:
            lf = json.loads(lf)
        except Exception:
            return {}
    return lf if isinstance(lf, dict) else {}

SUBJECT_OUTBOUND = "events.message.outbound"
SUBJECT_AI_ACTIVITY = "events.ai.activity"  # live Simpuler phase for the inbox (WS-C)

COOLDOWN_SEC = 45          # burst debounce: max ~1 LLM analyze per conversation / 45s
JUNK_CONF = 0.7            # min detect_junk() confidence to auto-set spam/lost (FR-34/BR-44)
# Follow-up cadence + the terminal "no response -> Lost" close-out live in the
# messaging cron (services/messaging/main.go); the ai-agent only drafts each touch.
_ENTITY_CATS = {"Model/Brand Interest", "Price/Financing", "Visit/Showroom"}


_TPL_PLACEHOLDER_RE = re.compile(r"\{\{\s*(\d+)\s*\}\}")


def _template_body_params(body: str, ctx_values: List[str]) -> List[str]:
    """Fill {{1}}..{{n}} in an approved template body with the given context values,
    padded with '' so the count ALWAYS matches what WhatsApp expects (a mismatch
    makes Meta reject the send)."""
    nums = [int(n) for n in _TPL_PLACEHOLDER_RE.findall(body or "")]
    n = max(nums) if nums else 0
    return [(ctx_values[i] if i < len(ctx_values) else "") for i in range(n)]


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
                      COALESCE(cv.metadata, '{}'::jsonb) AS metadata,
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

    async with pool.acquire() as conn:
        await conn.execute(
            """UPDATE conversations SET
                 lost_reason = COALESCE($2, lost_reason),
                 -- Advisory summary/next-step (latest message wins; null keeps prior).
                 lead_summary = COALESCE($3, lead_summary),
                 lead_priority = COALESCE($4, lead_priority),
                 suggested_action = COALESCE($5, suggested_action),
                 suggested_action_reason = COALESCE($6, suggested_action_reason),
                 suggested_action_confidence = COALESCE($7, suggested_action_confidence),
                 ai_extracted_at = now()
               WHERE id = $1""",
            conv_id,
            result.get("lost_reason"),
            result.get("summary"), result.get("priority"),
            result.get("recommended_action"), result.get("action_reason"),
            result.get("action_confidence"),
        )
    # Merge the segment's qualifier fields into metadata.lead_fields (all segments,
    # incl. automotive brand/model/city/timeframe). This is the ONE lead-data path.
    lead_fields = result.get("fields")
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
    _req = segments.required_keys(conv["segment"])
    _lf = _lead_fields(conv["metadata"])
    missing = any(not _lf.get(k) for k in _req) if _req else False
    if missing and any(c in _ENTITY_CATS for c in cr["categories"]):
        return True, "fill_fields"
    return False, "no_change"


async def handle_followup(broker, pool, org_id: str, conv_id: str, log) -> None:
    """Draft one auto follow-up for a silent lead. The multi-touch cadence + the
    terminal "no response -> Lost" close-out live in the messaging cron
    (triggerFollowUps / autoMarkNoResponseLost); this only drafts the touch that
    the cron scheduled."""
    async with pool.acquire() as conn:
        conv = await conn.fetchrow(
            """SELECT cv.is_bot_active, cv.ai_agent_id, cv.followup_count,
                      cv.window_expires_at, COALESCE(cv.metadata, '{}'::jsonb) AS metadata,
                      cmp.ai_language, cmp.ai_dynamic_language,
                      cmp.name AS campaign_name, cmp.dealer_name,
                      ct.name AS contact_name,
                      ft.name AS ft_name, ft.language AS ft_language,
                      ft.status AS ft_status, ft.body AS ft_body,
                      a.system_prompt, a.model
                 FROM conversations cv
                 LEFT JOIN ai_agents a ON a.id = cv.ai_agent_id
                 LEFT JOIN campaigns cmp ON cmp.id = cv.campaign_id
                 LEFT JOIN contacts ct ON ct.id = cv.contact_id
                 LEFT JOIN message_templates ft ON ft.id = cmp.followup_template_id
                WHERE cv.id = $1""",
            conv_id,
        )
    if conv is None or not conv["is_bot_active"] or conv["ai_agent_id"] is None:
        return

    # WhatsApp only allows free-form messages inside the 24h service window. Touches
    # 1-2 (12h, 20h) fall inside it; the later touches (1d/3d/7d) fall outside. For
    # those, send the campaign's APPROVED follow-up template (B) if one is set;
    # otherwise skip the send (the cron still advances the cadence and eventually
    # closes the lead to Lost).
    win = conv["window_expires_at"]
    if win is not None and win <= datetime.now(timezone.utc):
        if conv["ft_name"] and (conv["ft_status"] or "").upper() == "APPROVED":
            params = _template_body_params(
                conv["ft_body"],
                [conv["contact_name"] or "kak",
                 conv["dealer_name"] or conv["campaign_name"] or "",
                 conv["campaign_name"] or ""],
            )
            await broker.publish(SUBJECT_OUTBOUND, org_id, {
                "conversation_id": conv_id, "sender_type": "bot", "type": "template",
                "template": {"name": conv["ft_name"],
                             "language": conv["ft_language"] or "id",
                             "body_params": params},
            })
            log.info("followup template sent (outside 24h window)",
                     extra={"conv": conv_id, "template": conv["ft_name"]})
        else:
            log.info("followup skipped: outside 24h window (no approved template)", extra={"conv": conv_id})
        return

    finance_ctx = ""
    _lf = _lead_fields(conv["metadata"]) if conv else {}
    if _lf.get("brand") or _lf.get("model"):
        import finance_rag
        ctx = await finance_rag.get_finance_context(pool, _lf.get("brand"), _lf.get("model"), _lf.get("city"))
        if ctx:
            finance_ctx = f"\n\n{ctx}\n"

    # Follow-ups honour the campaign's language setting, same as live replies (A).
    lang = ((conv["ai_language"] if conv else None) or "id").lower()
    lang_name = _LANG_NAMES.get(lang, "Bahasa Indonesia")
    if conv and conv["ai_dynamic_language"]:
        lang_rule = f"Reply in the SAME language the customer used. If it is unclear, default to {lang_name}."
    else:
        lang_rule = f"Always reply in {lang_name}, regardless of the customer's language."

    system_prompt = ((conv["system_prompt"] if conv and conv["system_prompt"] else "You are a helpful sales assistant.")
                     + "\n\n" + lang_rule + finance_ctx)
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

# One pending settle-then-reply task per conversation (in-memory dedupe), plus a
# strong ref set so the background tasks aren't garbage-collected mid-flight.
_PENDING_NURTURE: set[str] = set()
_BG_TASKS: set = set()


def _spawn_bg(coro) -> None:
    t = asyncio.ensure_future(coro)
    _BG_TASKS.add(t)
    t.add_done_callback(_BG_TASKS.discard)


async def _deferred_nurture(broker, pool, org_id: str, conv_id: str, message_id, body: str, log) -> None:
    """Let the burst window settle OFF the message-ack path, then reply once.
    Running this inline (via asyncio.sleep inside handle_inbound) held the
    JetStream ack past ack_wait and got the message redelivered/dropped -> no
    reply. maybe_nurture's own recent-bot / human-replied guards stop duplicates."""
    try:
        await asyncio.sleep(NURTURE_BURST_SEC)
    finally:
        _PENDING_NURTURE.discard(conv_id)
    try:
        await maybe_nurture(broker, pool, org_id, conv_id, message_id, body, None, log)
    except Exception:  # noqa: BLE001
        log.exception("deferred nurture failed", extra={"conv": conv_id})


@asynccontextmanager
async def _conv_reply_lock(pool, conv_id: str):
    """Non-blocking Postgres advisory lock scoped to one conversation. Yields
    (got, conn): got=True if this handler acquired it (owns reply generation),
    False if another already holds it. Serializes the check->generate->send
    critical section so two concurrent inbound handlers can't both fire a reply.
    The yielded `conn` is REUSED for the section's queries (via _conn_or) so the
    whole section holds a single pooled connection, not a lock conn plus query
    conns."""
    conn = await pool.acquire()
    got = False
    try:
        # hashtextextended -> 64-bit key (vs hashtext's 32-bit), so two different
        # conversations practically never collide onto the same lock slot.
        got = bool(await conn.fetchval("SELECT pg_try_advisory_lock(hashtextextended($1, 0))", conv_id))
        yield got, conn
    finally:
        if got:
            await conn.execute("SELECT pg_advisory_unlock(hashtextextended($1, 0))", conv_id)
        await pool.release(conn)


@asynccontextmanager
async def _conn_or(pool, conn):
    """Yield `conn` if the caller passed one (reuse it — e.g. the connection holding
    the advisory lock), otherwise acquire and release a fresh pooled connection."""
    if conn is not None:
        yield conn
    else:
        async with pool.acquire() as c:
            yield c


async def maybe_nurture(broker, pool, org_id: str, conv_id: str, message_id, body: str, cr, log) -> None:
    """AI auto-reply nurture. Gated by the conversation's campaign (ai_auto_reply).
    Generates a context-aware reply, sends it, auto-sends the intake form on the
    first turn, and hands off to a human (stand down + notify) once the lead's key
    details are collected or the lead asks for a person / is ready to transact."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT cv.is_bot_active, cv.assigned_agent_id::text AS agent_id,
                      cv.campaign_id::text AS campaign_id, cv.classification_locked,
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
    if cr and (cr.get("is_junk") or cr.get("off_topic")):
        return  # never reply to (or re-engage) spam / off-topic
    if not row["is_bot_active"]:
        # D: re-engage a lead the AI handed off but NO human ever picked up. Only
        # when the customer messages again, the lead isn't locked (spam), and no
        # human reply exists - so a genuine, still-waiting lead is never left dead.
        if row["classification_locked"]:
            return  # terminal/spam lead - stay down
        async with pool.acquire() as conn:
            human = await conn.fetchval(
                """SELECT count(*) FROM messages
                    WHERE conversation_id = $1 AND direction = 'outbound'
                      AND sender_type NOT IN ('bot', 'system')""",
                conv_id,
            )
        if human and human > 0:
            return  # a human is handling this lead - respect the handoff
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE conversations SET is_bot_active = true, updated_at = now() WHERE id = $1", conv_id)
        log.info("nurture re-engaged (handoff, no human pickup)", extra={"conv": conv_id})

    # Serialize reply generation per conversation with a Postgres advisory lock so
    # two concurrent inbound handlers can't both generate+send (double-reply). If
    # another handler already holds it, DEFER (never drop) so this message still
    # gets a reply once that one lands.
    async with _conv_reply_lock(pool, conv_id) as (got_lock, lock_conn):
        if not got_lock:
            if conv_id not in _PENDING_NURTURE:
                _PENDING_NURTURE.add(conv_id)
                _spawn_bg(_deferred_nurture(broker, pool, org_id, conv_id, message_id, body, log))
            return
        await _generate_and_send_reply(broker, pool, lock_conn, org_id, conv_id, message_id, body, row, log)


async def _generate_and_send_reply(broker, pool, conn, org_id: str, conv_id: str, message_id, body: str, row, log) -> None:
    """Re-check under the advisory lock (human takeover / burst guard) then build the
    prompt, generate ONE nurture reply, send it, auto-send the intake form on the
    first turn, and hand off when the lead is ready. Runs while _conv_reply_lock is
    held so it can never race a second inbound handler into a duplicate send. `conn`
    is that lock connection, reused for every query here so the section holds one."""
    async with _conn_or(pool, conn) as conn:
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
        # Bot replied moments ago. DEFER, but never by blocking here: sleeping in
        # the handler holds the JetStream ack past ack_wait -> redelivery -> the
        # message gets dropped after max_deliver (i.e. no reply at all). Schedule
        # ONE settle-then-reply task per conversation off the ack path instead;
        # when it re-runs after the window, recent_bot is clear so it replies once
        # (a burst of inbounds collapses to a single task via _PENDING_NURTURE).
        if conv_id not in _PENDING_NURTURE:
            _PENDING_NURTURE.add(conv_id)
            _spawn_bg(_deferred_nurture(broker, pool, org_id, conv_id, message_id, body, log))
        return

    # Credit gate (WS-F): if the campaign has a credit allocation and it's used up,
    # the AI stands down to a human (the lead is never dropped).
    async with _conn_or(pool, conn) as conn:
        cc = await conn.fetchrow(
            """SELECT cc.allocated_credits, cc.used_credits
                 FROM campaign_credits cc
                 JOIN conversations cv ON cv.campaign_id = cc.campaign_id
                WHERE cv.id = $1""",
            conv_id,
        )
    if cc and cc["allocated_credits"] > 0 and cc["used_credits"] >= cc["allocated_credits"]:
        log.info("nurture skipped: campaign credits exhausted", extra={"conv": conv_id})
        await _ai_handoff(broker, pool, org_id, conv_id, row["agent_id"], log, conn=conn)
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

    # Catalog grounding on EVERY turn (not only once brand+model are extracted, which
    # is throttled) so early price questions are grounded too. Falls back to the
    # campaign's own brand, and passes the customer's message so a named trim leads.
    finance_ctx = ""
    if row["campaign_id"]:
        import finance_rag
        # Campaign-scoped catalog first (falls back to global finance_packages).
        _lf = _lead_fields(row["metadata"])
        fc = await finance_rag.get_catalog_context(
            pool, row["campaign_id"], (_lf.get("brand") or row["brand"]), _lf.get("model"),
            _lf.get("city"), row["segment"], query=body, conn=conn)
        if fc:
            finance_ctx = f"\n\n{fc}\n"

    system_prompt = (row["system_prompt"] or "You are a helpful sales assistant.") + ctx + "\n\n" + lang_rule + finance_ctx
    history = await _load_history(pool, conv_id, message_id, conn=conn)
    await _publish_activity(broker, org_id, conv_id, "thinking", log)
    result = await llm.nurture(system_prompt, history, body, model=row["model"],
                               segment_guidance=segments.nurture_guidance(row["segment"]))
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
    async with _conn_or(pool, conn) as conn:
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

    # Hand off once info is complete OR the model flagged readiness. "Complete" is
    # segment-agnostic now: every segment (automotive included) checks its required
    # qualifier keys in metadata.lead_fields.
    req = segments.required_keys(row["segment"])
    lf = _lead_fields(row["metadata"])
    fields_done = bool(req) and all(lf.get(k) for k in req)
    if result.get("ready_for_handoff") or fields_done:
        await _ai_handoff(broker, pool, org_id, conv_id, row["agent_id"], log, conn=conn)


async def _ai_handoff(broker, pool, org_id: str, conv_id: str, agent_id, log, conn=None) -> None:
    """Stand the bot down and notify a human that a nurtured lead is ready. `conn`
    reuses the caller's connection (e.g. the advisory-lock one) when provided."""
    await _publish_activity(broker, org_id, conv_id, "handoff", log)
    async with _conn_or(pool, conn) as conn:
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
    # Junk (abusive / obscene / repeated spam) is terminal: alongside the 'spam'
    # disposition above, move it straight to the Lost stage so it leaves the active
    # funnel, and stand the bot down (handled in the UPDATE below).
    stage_key = "lost_not_purchase" if is_junk else c["stage_key"]

    # Diff vs stored classification -> drives the LLM gate.
    prev_cats = _as_list(prev["cats"]) if prev else []
    changed = (prev is None or prev["interest_level"] != interest
               or prev["ai_stage"] != stage_key)
    new_strong_intent = any(cat in STRONG_INTENT and cat not in prev_cats for cat in c["categories"])

    async with pool.acquire() as conn:
        stage_id = await conn.fetchval(
            "SELECT id FROM stages WHERE organization_id = $1 AND system_key = $2", org_id, stage_key
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
                 -- Junk stands the bot down immediately (no reply, no follow-up).
                 is_bot_active = CASE WHEN $10 = true THEN false ELSE is_bot_active END,
                 updated_at = now()
               WHERE id = $1 AND (classification_locked = false OR $2 IN ('warm', 'hot'))""",
            conv_id, interest, stage_key, stage_id, disp_id,
            reason, confidence, json.dumps(c["categories"]), lost_reason, is_junk,
        )
    log.info("lead classified", extra={"conv": conv_id, "interest": interest,
                                       "stage": stage_key, "junk": is_junk})
    return {
        "interest": interest, "stage_key": stage_key, "categories": c["categories"],
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


async def _load_history(pool, conv_id: str, exclude_message_id, conn=None) -> List[dict]:
    async with _conn_or(pool, conn) as conn:
        rows = await conn.fetch(
            """SELECT direction, body FROM messages
                WHERE conversation_id = $1 AND ($2::uuid IS NULL OR id <> $2::uuid)
                  AND body IS NOT NULL AND body <> ''
                ORDER BY created_at DESC LIMIT 16""",
            conv_id, exclude_message_id,
        )
    msgs = []
    for r in reversed(rows):
        role = "user" if r["direction"] == "inbound" else "assistant"
        msgs.append({"role": role, "content": r["body"]})
    return msgs
