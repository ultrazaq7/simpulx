"""Abstraksi embedding dengan dua provider:
- local : hashing deterministik (offline, tanpa API key) — untuk dev.
- openai: text-embedding-3-small (1536 dim).

Keduanya menghasilkan vektor berdimensi settings.embed_dim & ternormalisasi L2,
sehingga kompatibel dengan pencarian cosine pgvector.
"""
from __future__ import annotations

import hashlib
import math
import re
from typing import List

import httpx

from .settings import settings

_TOKEN_RE = re.compile(r"[a-z0-9]+")


def _l2_normalize(v: List[float]) -> List[float]:
    norm = math.sqrt(sum(x * x for x in v))
    if norm == 0:
        return v
    return [x / norm for x in v]


def _local_embed(text: str) -> List[float]:
    """Embedding deterministik berbasis hashing token (bag-of-hashed-tokens)."""
    dim = settings.embed_dim
    vec = [0.0] * dim
    tokens = _TOKEN_RE.findall(text.lower())
    for tok in tokens:
        # hash STABIL lintas-proses (hashlib, bukan hash() yang ter-randomize),
        # agar vektor knowledge & query ai-agent konsisten.
        h1 = _stable_hash("a:" + tok) % dim
        h2 = _stable_hash("b:" + tok) % dim
        vec[h1] += 1.0
        vec[h2] += 0.5
    return _l2_normalize(vec)


def _stable_hash(s: str) -> int:
    return int.from_bytes(hashlib.md5(s.encode("utf-8")).digest()[:8], "big")


async def _openai_embed(texts: List[str]) -> List[List[float]]:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.openai.com/v1/embeddings",
            headers={"Authorization": f"Bearer {settings.openai_api_key}"},
            json={"model": "text-embedding-3-small", "input": texts},
        )
        resp.raise_for_status()
        data = resp.json()["data"]
        return [_l2_normalize(item["embedding"]) for item in data]


async def embed_texts(texts: List[str]) -> List[List[float]]:
    """Meng-embed daftar teks. Jatuh ke local bila openai dipilih tapi tanpa key."""
    if not texts:
        return []
    if settings.embed_provider == "openai" and settings.openai_api_key:
        return await _openai_embed(texts)
    return [_local_embed(t) for t in texts]


async def embed_one(text: str) -> List[float]:
    out = await embed_texts([text])
    return out[0]
