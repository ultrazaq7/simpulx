"""ai-agent: otak AI. Mengonsumsi message.persisted (inbound) untuk meng-
klasifikasi lead (auto-CRM scoring). TIDAK membalas chat otomatis (smart-reply
dihapus). Pembuatan pesan follow-up ditangani worker terpisah berbasis waktu.

Juga mengekspos endpoint debug untuk menguji klasifikasi tanpa lewat NATS.
"""
from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from simpulx_common import llm
from simpulx_common.broker import Broker
from simpulx_common.db import get_pool
from simpulx_common.settings import settings

import orchestrator

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("ai-agent")

state: dict = {}


async def on_persisted(env: dict) -> bool:
    """Handler event message.persisted. Hanya proses pesan masuk dari kontak."""
    data = env.get("data", {})
    if data.get("direction") != "inbound" or data.get("sender_type") != "contact":
        return True  # abaikan outbound/echo, ack
    try:
        await orchestrator.handle_inbound(state["broker"], state["pool"], env, data, log)
        return True
    except Exception:  # noqa: BLE001
        log.exception("orchestration failed; will redeliver")
        return False  # nak -> redeliver
async def on_draft_followup(env: dict) -> bool:
    """Handler event cmd.ai.draft_followup."""
    data = env.get("data", {})
    conv_id = data.get("conversation_id")
    org_id = env.get("org_id")
    if conv_id and org_id:
        try:
            await orchestrator.handle_followup(state["broker"], state["pool"], org_id, conv_id, log)
            return True
        except Exception:
            log.exception("draft followup failed")
            return False
    return True

@asynccontextmanager
async def lifespan(app: FastAPI):
    state["pool"] = await get_pool()
    state["broker"] = await Broker.connect(settings.nats_url)
    await state["broker"].subscribe("events.message.persisted", "ai-agent", on_persisted)
    await state["broker"].subscribe("events.ai.draft_followup", "ai-agent-followup", on_draft_followup)
    log.info("ai-agent subscribed (provider=%s, embed=%s)", settings.llm_provider, settings.embed_provider)
    yield
    await state["broker"].close()


app = FastAPI(title="Simpulx ai-agent", lifespan=lifespan)


@app.get("/healthz")
async def healthz():
    return {"status": "ok", "llm": settings.llm_provider, "embed": settings.embed_provider}



class DebugReply(BaseModel):
    conversation_id: str
    org_id: str
    body: str
    message_id: str | None = None




@app.post("/debug/reply")
async def debug_reply(req: DebugReply):
    """Memicu orkestrasi langsung (untuk uji manual)."""
    env = {"org_id": req.org_id}
    data = {"conversation_id": req.conversation_id, "body": req.body,
            "message_id": req.message_id, "direction": "inbound", "sender_type": "contact"}
    await orchestrator.handle_inbound(state["broker"], state["pool"], env, data, log)
    return {"status": "processed"}


class SummaryReq(BaseModel):
    conversation_id: str
    org_id: str
    app_lang: str = "en"  # fallback language when the conversation language is unclear


@app.post("/summary/stream")
async def summary_stream(req: SummaryReq):
    """On-demand AI briefing for the active conversation, streamed as SSE.
    The agent triggers this from the inbox composer ('AI Smart Summary'); the
    final text is persisted to conversations.lead_summary."""
    pool = state["pool"]
    async with pool.acquire() as conn:
        conv = await conn.fetchrow(
            """SELECT a.system_prompt, a.model
                 FROM conversations cv
                 LEFT JOIN ai_agents a ON a.id = cv.ai_agent_id
                WHERE cv.id = $1""",
            req.conversation_id,
        )
    system_prompt = (conv["system_prompt"] if conv and conv["system_prompt"]
                     else "You are a helpful sales assistant.")
    model = conv["model"] if conv else None
    history = await orchestrator._load_history(pool, req.conversation_id, None)

    async def gen():
        parts: list[str] = []
        try:
            async for chunk in llm.stream_summary(system_prompt, history, model=model, app_lang=req.app_lang):
                parts.append(chunk)
                yield f"data: {json.dumps({'text': chunk})}\n\n"
        except Exception:  # noqa: BLE001
            log.exception("summary stream failed")
            yield f"data: {json.dumps({'error': 'generation failed'})}\n\n"
            return
        full = "".join(parts).strip()
        if full:
            try:
                async with pool.acquire() as conn:
                    await conn.execute(
                        "UPDATE conversations SET lead_summary = $2, ai_extracted_at = now() WHERE id = $1",
                        req.conversation_id, full,
                    )
            except Exception:  # noqa: BLE001
                log.exception("persist summary failed")
        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
