"""ai-agent: otak AI. Mengonsumsi message.persisted (inbound) untuk meng-
klasifikasi lead (auto-CRM scoring). TIDAK membalas chat otomatis (smart-reply
dihapus). Pembuatan pesan follow-up ditangani worker terpisah berbasis waktu.

Juga mengekspos endpoint debug untuk menguji klasifikasi tanpa lewat NATS.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from pydantic import BaseModel

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


@asynccontextmanager
async def lifespan(app: FastAPI):
    state["pool"] = await get_pool()
    state["broker"] = await Broker.connect(settings.nats_url)
    await state["broker"].subscribe("events.message.persisted", "ai-agent", on_persisted)
    log.info("ai-agent subscribed (provider=%s, embed=%s)", settings.llm_provider, settings.embed_provider)
    yield
    await state["broker"].close()


app = FastAPI(title="Simpulx ai-agent", lifespan=lifespan)


@app.get("/healthz")
async def healthz():
    return {"status": "ok", "llm": settings.llm_provider, "embed": settings.embed_provider}


class FollowUpReq(BaseModel):
    conversation_id: str
    org_id: str

@app.post("/followup")
async def trigger_followup(req: FollowUpReq):
    try:
        await orchestrator.handle_followup(state["broker"], state["pool"], req.org_id, req.conversation_id, log)
        return {"status": "ok"}
    except Exception as e:
        log.exception("followup failed")
        return {"status": "error", "error": str(e)}

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
