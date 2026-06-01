"""Pool PostgreSQL (asyncpg) + util format vektor pgvector."""
from __future__ import annotations

import asyncio
from typing import Iterable, Optional

import asyncpg

_pool: Optional[asyncpg.Pool] = None


def _normalize_url(url: str) -> str:
    # asyncpg tidak mengenal querystring sslmode=disable; bersihkan.
    return url.split("?")[0]


async def get_pool() -> asyncpg.Pool:
    """Mengembalikan pool global, retry saat boot hingga DB siap."""
    global _pool
    if _pool is not None:
        return _pool
    from .settings import settings

    last_err: Exception | None = None
    for _ in range(30):
        try:
            _pool = await asyncpg.create_pool(
                _normalize_url(settings.database_url), min_size=1, max_size=8
            )
            return _pool
        except Exception as e:  # noqa: BLE001
            last_err = e
            await asyncio.sleep(1)
    raise RuntimeError(f"DB not ready: {last_err}")


def to_pgvector(values: Iterable[float]) -> str:
    """Format list float menjadi literal pgvector: '[0.1,0.2,...]'."""
    return "[" + ",".join(f"{v:.6f}" for v in values) + "]"
