"""Retrieval RAG: cari chunk pengetahuan paling relevan (cosine, pgvector)."""
from __future__ import annotations

from typing import List, TypedDict

from simpulx_common.db import to_pgvector
from simpulx_common.embeddings import embed_one


class Retrieved(TypedDict):
    id: str
    content: str
    score: float


async def retrieve(pool, org_id: str, query: str, top_k: int) -> List[Retrieved]:
    emb = await embed_one(query)
    vec = to_pgvector(emb)
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT id, content, 1 - (embedding <=> $1::vector) AS score
                 FROM knowledge_chunks
                WHERE organization_id = $2 AND embedding IS NOT NULL
                ORDER BY embedding <=> $1::vector
                LIMIT $3""",
            vec, org_id, top_k,
        )
    from simpulx_common.settings import settings

    # Saring chunk yang skornya di bawah ambang relevansi.
    return [
        Retrieved(id=str(r["id"]), content=r["content"], score=float(r["score"]))
        for r in rows
        if float(r["score"]) >= settings.rag_min_score
    ]
