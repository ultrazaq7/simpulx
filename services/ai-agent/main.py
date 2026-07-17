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

import llm_usage
import orchestrator

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("ai-agent")


def _lead_fields(metadata) -> dict:
    """Parse conversations.metadata->'lead_fields' into a dict (asyncpg returns
    jsonb as str, so unwrap defensively). Segment-agnostic lead attributes live
    here now (brand/model/city for automotive, arbitrary keys for other segments)."""
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
    state["broker"] = await Broker.connect(settings.nats_url, log=log)
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


class ExtractCatalogReq(BaseModel):
    pdf_base64: str
    segment: str | None = None
    # Optional so an older gateway (mid-deploy, or a manual curl) still works — the
    # extraction just goes unbilled to any org rather than failing. The gateway
    # always sends it; see services/gateway/catalog.go.
    organization_id: str | None = None


@app.post("/extract/catalog")
async def extract_catalog(req: ExtractCatalogReq):
    """Extract catalog rows from a pricelist PDF via Claude (WS-A), STREAMED as SSE
    so the gateway can relay live sub-progress (rows extracted so far). Emits
    `data: {type:"progress"|"done"|"error", ...}` events; the gateway forwards the
    final rows to the client to review/import."""
    async def gen():
        if not req.pdf_base64:
            yield f"data: {json.dumps({'type': 'done', 'rows': [], 'error': 'no pdf'})}\n\n"
            return
        usage: dict = {}
        recorded = False

        async def flush_usage():
            # A catalog extraction has no conversation, so conversation_id stays NULL.
            nonlocal recorded
            if recorded or not req.organization_id:
                return
            recorded = True
            await llm_usage.record(state["pool"], req.organization_id, None, "catalog", usage, log)

        try:
            async for evt in llm.extract_catalog_stream(req.pdf_base64, segment=req.segment,
                                                        usage_out=usage):
                # Record BEFORE yielding a terminal event, never after the loop: the
                # gateway returns the moment it reads `done`/`error` (see
                # runCatalogExtract in services/gateway/catalog.go), closing the
                # connection, which CANCELS this generator. Anything after that final
                # yield silently never runs — no error, just a missing row.
                # usage is already complete here: extract_catalog_stream only emits a
                # terminal event once the upstream HTTP stream is fully consumed.
                if evt.get("type") in ("done", "error"):
                    await flush_usage()
                yield f"data: {json.dumps(evt)}\n\n"
        except Exception as e:  # noqa: BLE001
            log.exception("catalog extract failed")
            # A PDF that blew up halfway still burned tokens — that is exactly the
            # spend worth seeing.
            await flush_usage()
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
        # Backstop for a stream that ends without any terminal event; no-op otherwise.
        await flush_usage()

    return StreamingResponse(gen(), media_type="text/event-stream")


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
            """SELECT a.system_prompt, a.model,
                      COALESCE(cv.metadata, '{}'::jsonb) AS metadata,
                      cv.campaign_id, cmp.segment, cmp.brand AS campaign_brand,
                      cmp.name AS campaign_name, cmp.dealer_name
                 FROM conversations cv
                 LEFT JOIN ai_agents a ON a.id = cv.ai_agent_id
                 LEFT JOIN campaigns cmp ON cmp.id = cv.campaign_id
                WHERE cv.id = $1""",
            req.conversation_id,
        )

    finance_ctx = ""
    _lf = _lead_fields(conv["metadata"]) if conv else {}
    if conv and conv["campaign_id"]:
        import finance_rag
        # Campaign-scoped, same as the live reply path: a draft the agent sends to the
        # customer must ground on THIS campaign's pricelist, never another dealer's.
        ctx = await finance_rag.get_catalog_context(
            pool, conv["campaign_id"], (_lf.get("brand") or conv["campaign_brand"]),
            _lf.get("model"), _lf.get("city"), conv["segment"])
        if ctx:
            finance_ctx = f"\n\n{ctx}\n"

    dealer_ctx = ""
    if conv and conv.get("campaign_name"):
        dealer_ctx = f"\n\nPENTING: Kamu adalah asisten sales untuk dealer {conv['dealer_name']} pada campaign '{conv['campaign_name']}'. " \
                     f"JANGAN PERNAH menawarkan atau memberi harga mobil kompetitor. Jika ditanya mobil di luar campaign ini, tolak dengan sopan."

    system_prompt = (conv["system_prompt"] if conv and conv["system_prompt"]
                     else "You are a helpful sales assistant.") + dealer_ctx + finance_ctx
    model = conv["model"] if conv else None
    history = await orchestrator._load_history(pool, req.conversation_id, None)

    async def gen():
        parts: list[str] = []
        usage: dict = {}
        try:
            async for chunk in llm.stream_summary(system_prompt, history, model=model,
                                                  app_lang=req.app_lang, usage_out=usage):
                parts.append(chunk)
                yield f"data: {json.dumps({'text': chunk})}\n\n"
        except Exception:  # noqa: BLE001
            log.exception("summary stream failed")
            # Record whatever usage the stream reported before it broke: a partial
            # generation is still billed for the tokens it produced.
            await llm_usage.record(pool, req.org_id, req.conversation_id, "summary", usage, log)
            yield f"data: {json.dumps({'error': 'generation failed'})}\n\n"
            return
        await llm_usage.record(pool, req.org_id, req.conversation_id, "summary", usage, log)
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


