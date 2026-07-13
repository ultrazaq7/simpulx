"""Wrapper NATS JetStream untuk service Python (kompatibel dgn amplop Go).

Fitur resilience:
- idle_heartbeat (15s): server kirim heartbeat saat tidak ada pesan baru,
  sehingga client bisa detect stalled delivery.
- flow_control: server pause delivery saat client buffer penuh (bukan silent
  drop).
- reconnected_cb: otomatis re-subscribe semua JetStream consumer setelah
  koneksi reconnect, mencegah push subscription "hilang" setelah idle lama.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Awaitable, Callable, List, Tuple

import nats
from nats.js import JetStreamContext
from nats.js.api import ConsumerConfig

# Max delivery attempts before JetStream stops redelivering. On the final failed
# attempt we log the payload at ERROR and term() it, so a message is never dropped
# silently (it can be seen / replayed from the logs) instead of vanishing.
MAX_DELIVER = 3


class Broker:
    def __init__(self, nc, js: JetStreamContext, log: logging.Logger | None = None):
        self.nc = nc
        self.js = js
        self._log = log or logging.getLogger("simpulx.broker")
        self._subscriptions: List[Tuple[str, str, Callable]] = []

    @classmethod
    async def connect(cls, url: str, log: logging.Logger | None = None) -> "Broker":
        _log = log or logging.getLogger("simpulx.broker")
        # Mutable container so the closures below can reference the Broker
        # instance that is created *after* nats.connect returns.
        broker_ref: list[Broker] = []

        async def disconnected_cb():
            _log.warning("NATS disconnected")

        async def reconnected_cb():
            _log.info("NATS reconnected, re-subscribing JetStream consumers...")
            if broker_ref:
                await broker_ref[0]._resubscribe_all()

        async def error_cb(e):
            _log.error("NATS error: %s", e)

        nc = await nats.connect(
            url,
            reconnect_time_wait=1,
            max_reconnect_attempts=-1,
            disconnected_cb=disconnected_cb,
            reconnected_cb=reconnected_cb,
            error_cb=error_cb,
        )
        js = nc.jetstream()
        b = cls(nc, js, log=_log)
        broker_ref.append(b)
        return b

    async def publish(self, subject: str, org_id: str, data: dict) -> None:
        envelope = {
            "id": str(uuid.uuid4()),
            "type": subject.removeprefix("events."),
            "org_id": org_id,
            "ts": datetime.now(timezone.utc).isoformat(),
            "data": data,
        }
        await self.js.publish(subject, json.dumps(envelope).encode())

    async def subscribe(
        self, subject: str, durable: str, handler: Callable[[dict], Awaitable[bool]]
    ) -> None:
        """Push subscription durable+queue. handler menerima ENVELOPE (dict).
        Kembalikan True untuk ack, False untuk nak (redeliver)."""
        self._subscriptions.append((subject, durable, handler))
        await self._do_subscribe(subject, durable, handler)

    async def _do_subscribe(
        self, subject: str, durable: str, handler: Callable[[dict], Awaitable[bool]]
    ) -> None:
        """Internal: bind satu push subscription ke JetStream consumer."""

        async def cb(msg):
            try:
                env = json.loads(msg.data.decode())
            except Exception:  # noqa: BLE001
                await msg.term()  # payload rusak
                return
            try:
                ok = await handler(env)
            except Exception:  # noqa: BLE001
                await self._fail(msg, subject, "handler raised")
                return
            if ok:
                await msg.ack()
            else:
                await self._fail(msg, subject, "handler returned false")

        config = ConsumerConfig(
            # Must comfortably exceed the slowest handler. The ai-agent runs up to
            # two serial LLM calls per inbound (nurture ~60s + analyze ~120s), so a
            # 30s ack_wait made handlers routinely miss the deadline -> JetStream
            # redelivered -> after max_deliver the message was dropped with NO reply.
            ack_wait=300.0,
            max_deliver=MAX_DELIVER,
        )
        await self.js.subscribe(
            subject, durable=durable, queue=durable, cb=cb, manual_ack=True,
            config=config, idle_heartbeat=15.0, flow_control=True,
        )

    async def _fail(self, msg, subject: str, reason: str) -> None:
        """Handle a failed delivery. Redeliver (nak) until the last allowed attempt;
        on that final attempt, log the payload at ERROR and term() so the message is
        dropped LOUDLY (visible + replayable from logs) rather than silently."""
        delivered = 0
        try:
            delivered = msg.metadata.num_delivered
        except Exception:  # noqa: BLE001
            pass
        if delivered >= MAX_DELIVER:
            self._log.error(
                "message dropped after %d deliveries (%s) subject=%s payload=%s",
                delivered, reason, subject, msg.data.decode(errors="replace"),
            )
            await msg.term()
        else:
            await msg.nak()

    async def _resubscribe_all(self) -> None:
        """Re-bind semua push subscriptions setelah NATS reconnect.

        Best-effort: log error per-subscription, jangan crash. Durable consumer
        state (ack position) tetap di server, jadi delivery lanjut dari posisi
        terakhir yang di-ack.
        """
        for subject, durable, handler in self._subscriptions:
            try:
                await self._do_subscribe(subject, durable, handler)
                self._log.info("re-subscribed %s/%s", subject, durable)
            except Exception:  # noqa: BLE001
                self._log.exception("re-subscribe failed: %s/%s", subject, durable)

    async def close(self) -> None:
        await self.nc.drain()
