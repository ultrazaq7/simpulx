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

from classifier import classify, is_trivial, STRONG_INTENT, detect_junk, buy_within_3mo
import lead_score
import llm_usage
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
                      cmp.segment, cmp.brand AS campaign_brand,
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
    # Every segment extracts its own qualifier fields into lead_fields, and the
    # lost_reason enum is constrained to what makes sense for this segment.
    extra_fields = segments.extra_fields_for(conv["segment"])
    lost_reasons = segments.lost_reason_values(conv["segment"])
    usage: dict = {}
    result = await llm.analyze(system_prompt, history, body, model=conv["model"],
                               extra_fields=extra_fields, lost_reasons=lost_reasons,
                               usage_out=usage)
    await llm_usage.record(pool, org_id, conv_id, "extract", usage, log)

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
    # A branded campaign is single-brand by construction: the lead arrived through
    # THIS campaign's ad, so their brand is the campaign's brand -- full stop. The
    # extractor doesn't know that and reads competitor mentions as the lead's own
    # brand: a Mitsubishi campaign ended up with {"brand": "Daihatsu", "model":
    # "Xforce"} (Xforce is a Mitsubishi). That corrupts the lead data the sales team
    # reads AND poisons grounding downstream, where a wrong brand pulls another
    # brand's rows out of the global finance_packages. Pin it instead of trusting
    # the model. Brand-agnostic campaigns (no brand set) keep the extracted value.
    if lead_fields and conv["campaign_brand"]:
        lead_fields["brand"] = conv["campaign_brand"]
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
                      cv.campaign_id,
                      cv.window_expires_at, COALESCE(cv.metadata, '{}'::jsonb) AS metadata,
                      cmp.ai_language, cmp.ai_dynamic_language,
                      cmp.segment, cmp.brand AS campaign_brand,
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
    if conv and conv["campaign_id"]:
        import finance_rag
        # Campaign-scoped, same as the live reply path: a follow-up must never ground
        # on another dealer's pricing either.
        ctx = await finance_rag.get_catalog_context(
            pool, conv["campaign_id"], (_lf.get("brand") or conv["campaign_brand"]),
            _lf.get("model"), _lf.get("city"), conv["segment"])
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
    usage: dict = {}
    reply = await llm.draft_followup(
        system_prompt, history,
        "Tolong buatkan pesan follow-up untuk customer ini.",
        model=conv["model"], touch=(conv["followup_count"] or 1),
        usage_out=usage,
    )
    # Recorded before the send gate below: the tokens are spent whether or not the
    # draft turns out to be empty and gets dropped.
    await llm_usage.record(pool, org_id, conv_id, "followup", usage, log)
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
NURTURE_SETTLE_SEC = 10  # debounce: wait this long for a burst of inbounds to settle,
                         # then send ONE reply covering all of it (1 burst = 1 credit)

# One pending settle-then-reply task per conversation (in-memory dedupe), plus a
# strong ref set so the background tasks aren't garbage-collected mid-flight.
_PENDING_NURTURE: set[str] = set()
_BG_TASKS: set = set()


def _spawn_bg(coro) -> None:
    t = asyncio.ensure_future(coro)
    _BG_TASKS.add(t)
    t.add_done_callback(_BG_TASKS.discard)


async def _settle_then_reply(broker, pool, org_id: str, conv_id: str, message_id, body: str, log) -> None:
    """Let the burst settle OFF the message-ack path, then reply exactly once.
    Running this inline (via asyncio.sleep inside handle_inbound) held the JetStream
    ack past ack_wait and got the message redelivered/dropped -> no reply.

    The pending flag is released when the WINDOW ends, not when the reply lands: a
    message that arrives while the reply is being generated must start a new burst
    (and get its own answer) rather than be silently dropped."""
    try:
        await asyncio.sleep(NURTURE_SETTLE_SEC)
    finally:
        _PENDING_NURTURE.discard(conv_id)
    try:
        await _nurture_now(broker, pool, org_id, conv_id, message_id, body, None, log)
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


async def _human_took_over(conn, conv_id: str) -> bool:
    """True when an agent pressed Take over and has not handed the conversation
    back yet. The bot being off is not enough to tell: the AI stands itself down
    on handoff too, and that case is allowed to re-engage. Only the timeline says
    which one it was, so read the latest of the two toggle events."""
    last = await conn.fetchval(
        """SELECT type FROM conversation_events
            WHERE conversation_id = $1 AND type IN ('bot_takeover', 'bot_released')
            ORDER BY created_at DESC LIMIT 1""",
        conv_id,
    )
    return last == "bot_takeover"


async def maybe_nurture(broker, pool, org_id: str, conv_id: str, message_id, body: str, cr, log) -> None:
    """Entry point for the AI auto-reply. NEVER replies inline: it debounces.

    A lead usually fires several messages in a row ("harga?", "yang dakar", "di
    jakarta pusat"), and every reply costs the customer a credit. The old flow
    answered the first message immediately and then scheduled a second, deferred
    reply for the rest of the burst -- so one burst always cost TWO credits (seen
    live: two bot messages in the same minute). Now a burst schedules ONE settle
    task, and the reply that fires after the window has the whole burst in context.
    Also keeps the reply off the JetStream ack path (sleeping in the handler held
    the ack past ack_wait -> redelivery -> the message was dropped, i.e. no reply)."""
    if cr and (cr.get("is_junk") or cr.get("off_topic")):
        return  # never reply to (or re-engage) spam / off-topic
    if conv_id in _PENDING_NURTURE:
        return  # a settle task already owns this conversation's next reply
    _PENDING_NURTURE.add(conv_id)
    _spawn_bg(_settle_then_reply(broker, pool, org_id, conv_id, message_id, body, log))


async def _nurture_now(broker, pool, org_id: str, conv_id: str, message_id, body: str, cr, log) -> None:
    """Generate + send ONE reply for this conversation (called by the settle task).
    Gated by the conversation's campaign (ai_auto_reply); auto-sends the intake form
    on the first turn, and hands off to a human (stand down + notify) once the lead's
    key details are collected or the lead asks for a person / is ready to transact."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT cv.is_bot_active, cv.assigned_agent_id::text AS agent_id,
                      cv.campaign_id::text AS campaign_id, cv.classification_locked,
                      COALESCE(cv.metadata, '{}'::jsonb) AS metadata,
                      a.system_prompt, a.model,
                      cmp.ai_auto_reply, cmp.segment, cmp.brand, cmp.ai_language,
                      cmp.ai_dynamic_language, cmp.intake_form_id::text AS intake_form_id,
                      cmp.name AS campaign_name, cmp.dealer_name,
                      cmp.keywords, cmp.covered_cities,
                      -- An ad opener (CTWA referral, or a wa.me link pre-filled with the
                      -- campaign keyword) is NOT the lead's own words. messaging already
                      -- flags those genuine=false; without reading it here the catalog
                      -- would treat an ad's tracking param ("pajero1", "promo-dp-ringan")
                      -- as a real question -- ranking on it, and worse, letting it open
                      -- the price gate. Default TRUE so a missing/unknown id behaves as
                      -- it did before (a real typed message).
                      COALESCE((SELECT m.genuine FROM messages m WHERE m.id = $2), true) AS genuine
                 FROM conversations cv
                 LEFT JOIN ai_agents a ON a.id = cv.ai_agent_id
                 LEFT JOIN campaigns cmp ON cmp.id = cv.campaign_id
                WHERE cv.id = $1""",
            conv_id, message_id,
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
            if await _human_took_over(conn, conv_id):
                return  # an agent explicitly took over - only they can hand back
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
    # two concurrent handlers can't both generate+send (double-reply). If another
    # already holds it, that one is producing the reply for this conversation right
    # now: drop out instead of queueing a second settle task. Nothing is lost -- the
    # holder answers whatever has arrived, and anything that lands after its reply
    # starts a fresh burst (the has_new guard decides whether a reply is owed).
    async with _conv_reply_lock(pool, conv_id) as (got_lock, lock_conn):
        if not got_lock:
            log.info("nurture skipped: another reply in flight", extra={"conv": conv_id})
            return
        await _generate_and_send_reply(broker, pool, lock_conn, org_id, conv_id, message_id, body, row, log)


async def _generate_and_send_reply(broker, pool, conn, org_id: str, conv_id: str, message_id, body: str, row, log) -> None:
    """Re-check under the advisory lock (human takeover / burst guard) then build the
    prompt, generate ONE nurture reply, send it, auto-send the intake form on the
    first turn, and hand off when the lead is ready. Runs while _conv_reply_lock is
    held so it can never race a second inbound handler into a duplicate send. `conn`
    is that lock connection, reused for every query here so the section holds one."""
    async with _conn_or(pool, conn) as conn:
        # Explicit takeover: an agent may have pressed Take over after `row` was
        # read - while this reply was deferred behind the burst window or the
        # lock, or while the model was generating. Re-read it here, under the
        # lock, so the in-flight reply is dropped instead of landing on top of
        # the agent who just claimed the conversation.
        if await _human_took_over(conn, conv_id):
            log.info("nurture stand down (agent took over)", extra={"conv": conv_id})
            return
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
        # Only reply when the customer has actually said something SINCE our last
        # reply. Every reply costs the customer a credit, so answering when nothing
        # new arrived is money for nothing. This is the guard that makes a burst cost
        # exactly ONE reply (the settle task already collapsed the burst), and it also
        # makes a redelivered/duplicated inbound harmless instead of a second charge.
        has_new = await conn.fetchval(
            """SELECT EXISTS (
                 SELECT 1 FROM messages m
                  WHERE m.conversation_id = $1 AND m.direction = 'inbound'
                    AND m.sender_type = 'contact'
                    AND m.created_at > COALESCE((
                          SELECT max(b.created_at) FROM messages b
                           WHERE b.conversation_id = $1 AND b.direction = 'outbound'
                             AND b.sender_type = 'bot'), '-infinity'::timestamptz))""",
            conv_id,
        )
    if not has_new:
        log.info("nurture skipped: nothing new since last reply", extra={"conv": conv_id})
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
    # Only the lead's OWN words may rank variants or open the price gate -- an ad's
    # tracking keyword is not a question. Whatever is left after stripping it IS.
    lead_words = _lead_words(body, row["keywords"], row["genuine"])

    import finance_rag
    finance_ctx = ""
    recent_text = ""  # recent inbound text; also drives the cross-turn promo/price gate
    if row["campaign_id"] and lead_words:
        # Campaign-scoped catalog first (falls back to global finance_packages).
        _lf = _lead_fields(row["metadata"])
        # A price question doesn't repeat on every turn: a lead asks "berapa termurah",
        # then answers the bot's follow-ups ("Xpander Ultimate", "CVT") with no price
        # word -- but they're still owed the number. The gate opens on price intent in
        # the recent conversation, not only this message. Once asked, a price is no
        # longer anchoring, so keeping it available for a few turns is exactly right.
        recent = await conn.fetch(
            """SELECT body FROM messages
                WHERE conversation_id = $1 AND direction = 'inbound' AND genuine
                ORDER BY created_at DESC LIMIT 8""", conv_id)
        recent_text = " ".join(r["body"] or "" for r in recent)
        fc = await finance_rag.get_catalog_context(
            pool, row["campaign_id"], (_lf.get("brand") or row["brand"]), _lf.get("model"),
            _lf.get("city"), row["segment"], query=lead_words, recent_text=recent_text, conn=conn)
        if fc:
            finance_ctx = f"\n\n{fc}\n"

    # Nothing left after the keyword => a bare ad opener ("Xforce1"): a click, not a
    # question. Answering it with the catalog is the bot talking first, so withhold it
    # and just greet.
    if not lead_words:
        finance_ctx = ("\n\nPENTING: Pesan customer di atas BUKAN ketikan dia -- itu kata kunci "
                       "otomatis dari iklan yang dia klik. Dia BELUM menanyakan apa pun. "
                       "JANGAN menyodorkan katalog, daftar varian, atau harga. Sapa dengan hangat, "
                       "perkenalkan diri singkat, lalu tanyakan apa yang bisa dibantu.\n")

    # Out-of-area is a fact the bot must OWN, not hide behind "cek ke tim". Once the
    # lead's city is known to sit outside the service area, running a normal in-area
    # price funnel is what makes the bot look broken (it happened: a Jombang lead got
    # four turns of dodging on a Jakarta-only campaign). Tell the customer plainly and
    # set expectations that a teammate will follow up -- which is now TRUE, because
    # this reply is the last one before the deterministic out-of-area handoff below
    # (it no longer waits for the full qualifier set). So this governs the bot's final
    # message: own the area, promise the handoff, don't fake availability.
    _city = _lead_fields(row["metadata"]).get("city")
    ooa_city = _out_of_area_city(_city, row["covered_cities"])
    if ooa_city:
        finance_ctx += (
            f"\n\nCATATAN AREA LAYANAN: domisili customer ({ooa_city}) DI LUAR area layanan "
            "campaign ini. WAJIB sampaikan dengan jujur dan sopan bahwa area itu di luar "
            "jangkauan reguler, JANGAN pura-pura seperti area normal, dan JANGAN menjanjikan "
            "harga/pengiriman seolah pasti tersedia di sana. Jelaskan bahwa ketersediaan/"
            "serviceability untuk area itu akan dicek dan dibantu langsung oleh tim.\n")
    elif row["covered_cities"] and not _city:
        # Domicile is the one qualifier that decides service area, and an out-of-area
        # lead is escalated the moment it is known -- so ask it EARLY to catch those
        # leads before burning nurture turns. Never at the cost of dodging: a lead who
        # opened with a price question gets answered first (that was bug 0d4b9bc); the
        # domicile question rides along in the same reply.
        finance_ctx += (
            "\n\nCATATAN: kota/domisili customer belum diketahui. Tanyakan domisili lebih awal "
            "supaya area layanan bisa dipastikan, TAPI jawab dulu pertanyaan customer bila ada "
            "-- selipkan pertanyaan domisili di balasan yang sama, jangan mengabaikan pertanyaannya.\n")

    # Promo from the ad creative. A lead often arrives from a Meta/TikTok ad whose promo
    # (DP promo, bunga 0%, cashback) is burned into the IMAGE -- which the bot never sees
    # -- and asks to confirm it ("DP 10jt bener? bunga 0% bener?"). The catalog has only
    # STANDARD OTR/tenor, never promo terms, so letting the bot answer from catalog risks
    # fabricating a promo, or worse DENYING a real one. Same rule as the price-anchoring
    # fix: never state an ungrounded figure. So acknowledge the promo topic (quoting the
    # ad's own text when we captured it), refuse to confirm/deny specific promo numbers,
    # defer to the team, and hand off (below) so a human quotes the real terms.
    asks_promo = bool(lead_words) and (finance_rag._asks_promo(lead_words) or finance_rag._asks_promo(recent_text))
    if asks_promo:
        ad = await conn.fetchrow(
            """SELECT referral_headline, referral_body FROM conversation_attributions
                WHERE conversation_id = $1
                  AND (referral_headline IS NOT NULL OR referral_body IS NOT NULL)
                ORDER BY created_at DESC LIMIT 1""", conv_id)
        ad_text = ""
        if ad:
            parts = [p.strip() for p in (ad["referral_headline"], ad["referral_body"]) if p and p.strip()]
            if parts:
                ad_text = (" Teks iklan yang diklik customer: \"" + " | ".join(parts) + "\". Kamu BOLEH "
                           "menyebut apa yang tertulis di teks itu, tapi TETAP tidak boleh mengkonfirmasi "
                           "angka/syarat promo yang tidak tertulis di sana.")
        finance_ctx += (
            "\n\nCATATAN PROMO: customer menyinggung promo/penawaran (mis. DP promo, bunga 0%, cashback, "
            "diskon). Kamu TIDAK punya data promo yang terverifikasi -- katalog hanya berisi harga/cicilan "
            "STANDAR, BUKAN syarat promo. AKUI topik promonya dengan sopan, TAPI JANGAN mengkonfirmasi, "
            "menyangkal, atau mengarang angka/syarat promo spesifik (DP, bunga, cashback, periode). Katakan "
            "untuk kepastian promo & syaratnya kamu akan konfirmasi langsung ke tim. JANGAN memakai angka "
            "cicilan/DP standar dari katalog seolah-olah itu promo." + ad_text + "\n")

    system_prompt = (row["system_prompt"] or "You are a helpful sales assistant.") + ctx + "\n\n" + lang_rule + finance_ctx
    history = await _load_history(pool, conv_id, message_id, conn=conn)
    await _publish_activity(broker, org_id, conv_id, "thinking", log)
    usage: dict = {}
    result = await llm.nurture(system_prompt, history, body, model=row["model"],
                               segment_guidance=segments.nurture_guidance(row["segment"]),
                               usage_out=usage)
    # Recorded before the empty-reply return below: the tokens are billed either way.
    # Reuses the advisory-lock connection this section already holds, so the ledger
    # write doesn't take a second pool slot per in-flight reply.
    await llm_usage.record(pool, org_id, conv_id, "nurture", usage, log, conn=conn)
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

    # Spammer/troll: the reply just sent was the closing line, so stop here. Every
    # reply costs the customer a credit, and a lead with zero buying interest was
    # getting one per "gkgkgk". No intake form, no handoff -- there's nobody to hand.
    if result.get("stand_down"):
        await _ai_stand_down_spam(pool, org_id, conv_id, log, conn=conn)
        return

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
    # An out-of-area lead hands off the MOMENT its city is known to sit outside the
    # service area -- it does NOT wait for the full qualifier set the way an in-area
    # lead does. The bot cannot decide serviceability (only a human can, e.g. an
    # out-of-town KTP living in the covered city), so nurturing it for the remaining
    # qualifiers is pure friction: purchase_timeframe in particular often stays null
    # on "masih survei, gatau kapan", which left these leads looping forever while
    # the reply kept promising a teammate would follow up (verified in prod). The
    # note carries whatever product interest was already captured -- we don't wait to
    # collect more. In-area leads still require all qualifiers, so agents aren't
    # flooded with context-less leads.
    # A promo question also hands off: the bot just told the customer a teammate will
    # confirm the real promo terms (it must not quote them itself), so a human has to
    # actually pick it up -- otherwise that promise stalls the same way out-of-area did.
    if ooa_city or asks_promo or result.get("ready_for_handoff") or fields_done:
        await _ai_handoff(broker, pool, org_id, conv_id, row["agent_id"], log, conn=conn,
                          out_of_area_city=ooa_city, product=lf.get("model") or lf.get("brand"),
                          promo=asks_promo)


def _out_of_area_city(city, covered_cities) -> str | None:
    """The lead's city when it is OUTSIDE the campaign's declared service area, else None.

    Fails OPEN on purpose: unknown city, or a campaign that never declared a service
    area, is NOT out-of-area. Flagging leads because nobody filled the field in would
    push work at agents for a config gap, which is worse than missing the flag.

    Matched loosely (substring, both ways) because a covered city is written "Jakarta
    Barat" while a lead types "jakbar"/"Jakarta" -- an exact compare would call half
    the service area out-of-area."""
    c = (city or "").strip().lower()
    if not c or not covered_cities:
        return None
    for cc in covered_cities:
        cc = (cc or "").strip().lower()
        if cc and (cc in c or c in cc):
            return None
    return city.strip()


_AD_RESIDUE = " \t\n-_.,!?()[]{}:;\"'"


def _lead_words(body: str, keywords, genuine: bool) -> str:
    """What the LEAD actually wrote, with the ad's tracking keyword taken out.

    `genuine` is false for every ad-sourced message (CTWA referral or a keyword-routed
    wa.me pre-fill), but it is too blunt to act on alone: keyword routing matches on
    SUBSTRING, so "Xforce1 Ultimate DS harganya berapa" is genuine=false too — yet the
    lead plainly asked something. Treating the whole body as not-the-lead's-words made
    the bot answer a real price question with "let me check with the team".
    So: strip the keywords, and whatever remains is theirs."""
    if genuine:
        return body or ""
    residual = body or ""
    for k in (keywords or []):
        k = (k or "").strip()
        if k:
            residual = re.sub(re.escape(k), " ", residual, flags=re.IGNORECASE)
    return "" if not residual.strip(_AD_RESIDUE) else residual


async def _ai_stand_down_spam(pool, org_id: str, conv_id: str, log, conn=None) -> None:
    """Stop serving a spammer/troll the nurture model flagged (stand_down): park the
    lead as lost/spam and stand the bot down, so it never spends another credit on
    someone with zero buying interest (a real case burned one reply per "gkgkgk").

    Also clears unread_count: this lead is junk, so it must not sit in the agent's
    inbox wearing an unread badge. Mirrors the rules-based junk disposition in
    classify_and_update -- this catches what the high-precision rules can't (gibberish,
    trolling, non-answers), which is why the model's guardrail is deliberately strict.
    No notification: there is nothing here worth handing to a human."""
    async with _conn_or(pool, conn) as conn:
        stage_id = await conn.fetchval(
            "SELECT id FROM stages WHERE organization_id = $1 AND system_key = $2",
            org_id, "lost_not_purchase")
        disp_id = await conn.fetchval(
            "SELECT id FROM dispositions WHERE organization_id = $1 AND system_key = $2",
            org_id, "spam")
        await conn.execute(
            """UPDATE conversations SET
                 is_bot_active = false, classification_locked = true,
                 interest_level = 'cold', ai_stage = 'lost_not_purchase',
                 stage_id = COALESCE($2, stage_id),
                 disposition_id = COALESCE(disposition_id, $3),  -- keep human-set
                 lost_reason = COALESCE(lost_reason, 'spam_junk'),
                 ai_reason = 'Spam/troll: tidak ada minat beli sama sekali, bot dihentikan.',
                 unread_count = 0,
                 updated_at = now()
               WHERE id = $1""", conv_id, stage_id, disp_id)
    log.info("nurture stand down (spam/troll)", extra={"conv": conv_id})


async def _ai_handoff(broker, pool, org_id: str, conv_id: str, agent_id, log, conn=None,
                      out_of_area_city: str | None = None, product: str | None = None,
                      promo: bool = False) -> None:
    """Stand the bot down and notify a human that a nurtured lead is ready. `conn`
    reuses the caller's connection (e.g. the advisory-lock one) when provided.

    `out_of_area_city` marks a lead whose city sits outside the campaign's service
    area. It only changes the note: an agent picking this up needs to know the one
    thing the bot cannot decide -- an out-of-town KTP living in the covered city is a
    common, real lead, and only a human can confirm serviceability. `product` is the
    lead's captured interest (model/brand) folded into that note when known, so an
    out-of-area lead handed off early still arrives with context, not just a city.
    `promo` marks a lead asking about an ad promo the bot can't verify: the human must
    quote the real promo terms, since the bot was told not to."""
    await _publish_activity(broker, org_id, conv_id, "handoff", log)
    async with _conn_or(pool, conn) as conn:
        reason = None
        if out_of_area_city:
            reason = f"luar area ({out_of_area_city})"
            if product:
                reason += f" - minat {product}"
            if promo:
                reason += " + tanya promo"
        elif promo:
            reason = "tanya promo iklan - perlu konfirmasi tim"
            if product:
                reason += f" ({product})"
        await conn.execute(
            """UPDATE conversations SET is_bot_active = false, handoff_at = now(),
                 handoff_reason = COALESCE($2, handoff_reason), updated_at = now()
               WHERE id = $1""", conv_id, reason)
        recipients = [agent_id] if agent_id else [
            r["id"] for r in await conn.fetch(
                "SELECT id::text AS id FROM users WHERE organization_id = $1 AND status = 'active' AND role IN ('admin','owner','manager')",
                org_id,
            )
        ]
        if out_of_area_city:
            title = f"Lead luar area ({out_of_area_city})"
            minat = f" Minat: {product}." if product else ""
            promo_note = " Lead juga menanyakan promo iklan -- konfirmasi syarat promonya juga." if promo else ""
            bodytext = (f"Domisili lead ({out_of_area_city}) di luar area campaign ini.{minat} "
                        "Cek domisili & serviceability -- KTP luar kota tapi tinggal di area "
                        f"layanan itu lead beneran.{promo_note}")
        elif promo:
            title = "Lead tanya promo iklan"
            minat = f" ({product})" if product else ""
            bodytext = (f"Lead menanyakan promo dari iklan{minat}. Bot TIDAK punya data promo "
                        "terverifikasi, jadi cuma mengakui topiknya tanpa menyebut angka. Konfirmasi "
                        "syarat/angka promo (DP, bunga, cashback, periode) langsung ke lead.")
        else:
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
        prev = await conn.fetchrow(
            """SELECT cv.interest_level, cv.ai_stage, (cv.metadata->'intent_categories') AS cats,
                      cv.metadata AS metadata, cmp.covered_cities, cmp.segment
                 FROM conversations cv
                 LEFT JOIN campaigns cmp ON cmp.id = cv.campaign_id
                WHERE cv.id = $1""", conv_id,
        )

    c = classify(msgs)
    junk = detect_junk(msgs)
    is_junk = junk["is_junk"] and junk["confidence"] >= JUNK_CONF

    # Junk override (FR-34/BR-44): high-precision rules -> cold + spam disposition +
    # lost_reason. COALESCE keeps any human-set disposition/lost_reason; reversible via UI.
    interest = "cold" if is_junk else c["interest"]
    # Business filters on the temperature (needs lead_fields + service area, which the
    # pure-text classifier can't see). Order matters: out-of-area is filtered FIRST -- an
    # out-of-area lead is never hot/warm, only a human can judge serviceability. Then buy
    # horizon: planning to buy >3 months out (or non-committal "masih survei") is cold.
    # HOT survives on strong intent alone (no completeness needed); WARM additionally
    # requires the full qualifier set AND a clearly-soon horizon, so an agent only ever
    # gets a warm lead that is genuinely ready to handle. lead_fields lags one turn (the
    # LLM extract runs after this), which is fine: the temperature settles next turn.
    filter_reason = None
    if not is_junk and interest in ("hot", "warm") and prev is not None:
        lf = _lead_fields(prev["metadata"])
        ooa = _out_of_area_city(lf.get("city"), prev["covered_cities"])
        horizon = buy_within_3mo(lf.get("purchase_timeframe"))
        req = segments.required_keys(prev["segment"])
        fields_done = bool(req) and all(lf.get(k) for k in req)
        if ooa:
            interest, filter_reason = "cold", f"Luar area layanan ({ooa}); serviceability perlu dicek tim."
        elif horizon is False:
            interest, filter_reason = "cold", "Rencana pembelian >3 bulan atau belum pasti; belum prioritas."
        elif interest == "warm" and not (fields_done and horizon is True):
            interest, filter_reason = "cold", "Ada minat tapi info belum lengkap / timeframe belum pasti."
    disp_key = "spam" if is_junk else c["disposition_key"]
    reason = junk["reason"] if is_junk else (filter_reason or c["reason"])
    confidence = junk["confidence"] if is_junk else c["confidence"]
    lost_reason = junk["lost_reason"] if is_junk else None
    # Junk (abusive / obscene / repeated spam) is terminal: alongside the 'spam'
    # disposition above, move it straight to the Lost stage so it leaves the active
    # funnel, and stand the bot down (handled in the UPDATE below).
    stage_key = "lost_not_purchase" if is_junk else c["stage_key"]
    # A COLD lead is ambiguous, so the AI must not auto-advance it past "contacted".
    # Otherwise the funnel reports an out-of-area / far-horizon / incomplete lead as
    # "qualified" (Memenuhi Syarat) -- a lead the bot itself judged not ready. The AI
    # ceiling stays "qualified" for warm/hot; cold is pulled back to "contacted".
    if not is_junk and interest == "cold" and stage_key == "qualified":
        stage_key = "contacted"

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
                 -- Junk stands the bot down immediately (no reply, no follow-up), and
                 -- clears the unread badge so spam never clutters the agent's inbox.
                 is_bot_active = CASE WHEN $10 = true THEN false ELSE is_bot_active END,
                 unread_count = CASE WHEN $10 = true THEN 0 ELSE unread_count END,
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
