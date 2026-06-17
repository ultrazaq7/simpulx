"""knowledge: ingest dokumen/FAQ -> chunk -> embed -> simpan ke pgvector.

Dipakai untuk membangun knowledge base per organisasi yang menjadi sumber RAG
bagi ai-agent.
"""
from __future__ import annotations

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from simpulx_common.db import get_pool, to_pgvector
from simpulx_common.embeddings import embed_texts

from chunker import chunk_text

app = FastAPI(title="Simpulx knowledge")


class IngestRequest(BaseModel):
    organization_id: str
    title: str = Field(min_length=1)
    content: str = Field(min_length=1)
    source_type: str = "text"


class IngestResponse(BaseModel):
    source_id: str
    chunks: int


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


@app.post("/ingest", response_model=IngestResponse)
async def ingest(req: IngestRequest):
    chunks = chunk_text(req.content)
    if not chunks:
        raise HTTPException(status_code=400, detail="empty content")

    embeddings = await embed_texts(chunks)
    pool = await get_pool()

    async with pool.acquire() as conn:
        async with conn.transaction():
            source_id = await conn.fetchval(
                """INSERT INTO knowledge_sources (organization_id, title, source_type, status)
                   VALUES ($1, $2, $3, 'ready') RETURNING id""",
                req.organization_id, req.title, req.source_type,
            )
            for idx, (text, emb) in enumerate(zip(chunks, embeddings)):
                await conn.execute(
                    """INSERT INTO knowledge_chunks
                         (organization_id, source_id, chunk_index, content, embedding, token_count)
                       VALUES ($1, $2, $3, $4, $5::vector, $6)""",
                    req.organization_id, source_id, idx, text,
                    to_pgvector(emb), len(text.split()),
                )

    return IngestResponse(source_id=str(source_id), chunks=len(chunks))
