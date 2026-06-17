"""Konfigurasi terpusat dari environment variable."""
from __future__ import annotations

import os


class Settings:
    # Datastore / bus
    database_url: str = os.getenv(
        "DATABASE_URL", "postgres://simpulx:simpulx_secret@postgres:5432/simpulx_v2"
    )
    nats_url: str = os.getenv("NATS_URL", "nats://nats:4222")

    # LLM
    llm_provider: str = os.getenv("LLM_PROVIDER", "mock")  # anthropic | mock
    anthropic_api_key: str = os.getenv("ANTHROPIC_API_KEY", "")
    # Routine extraction/summary runs on every eligible message, so default to
    # Sonnet (not Opus) for cost. Per-agent ai_agents.model can still override.
    llm_model: str = os.getenv("LLM_MODEL", "claude-sonnet-4-6")

    # Embeddings
    embed_provider: str = os.getenv("EMBED_PROVIDER", "local")  # local | openai
    embed_dim: int = int(os.getenv("EMBED_DIM", "1536"))
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")

    # RAG
    rag_top_k: int = int(os.getenv("RAG_TOP_K", "4"))
    # Skor cosine minimum agar chunk dianggap relevan. Di bawah ini -> tak ada
    # konteks -> orchestrator condong handoff ke manusia.
    rag_min_score: float = float(os.getenv("RAG_MIN_SCORE", "0.15"))

    port: int = int(os.getenv("PORT", "8000"))


settings = Settings()
