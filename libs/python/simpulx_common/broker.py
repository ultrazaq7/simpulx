"""Wrapper NATS JetStream untuk service Python (kompatibel dgn amplop Go)."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Awaitable, Callable

import nats
from nats.js import JetStreamContext
from nats.js.api import ConsumerConfig


class Broker:
    def __init__(self, nc, js: JetStreamContext):
        self.nc = nc
        self.js = js

    @classmethod
    async def connect(cls, url: str) -> "Broker":
        nc = await nats.connect(url, reconnect_time_wait=1, max_reconnect_attempts=-1)
        js = nc.jetstream()
        return cls(nc, js)

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

        async def cb(msg):
            try:
                env = json.loads(msg.data.decode())
            except Exception:  # noqa: BLE001
                await msg.term()  # payload rusak
                return
            try:
                ok = await handler(env)
            except Exception:  # noqa: BLE001
                await msg.nak()
                return
            if ok:
                await msg.ack()
            else:
                await msg.nak()

        config = ConsumerConfig(
            ack_wait=30.0,
            max_deliver=3,
        )
        await self.js.subscribe(
            subject, durable=durable, queue=durable, cb=cb, manual_ack=True, config=config
        )

    async def close(self) -> None:
        await self.nc.drain()
