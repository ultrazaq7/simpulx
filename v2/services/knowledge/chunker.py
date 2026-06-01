"""Pemecah dokumen menjadi chunk untuk RAG."""
from __future__ import annotations

from typing import List

MAX_CHARS = 800
OVERLAP = 100


def chunk_text(text: str) -> List[str]:
    """Pecah per paragraf; paragraf panjang dipotong jendela ~800 char overlap 100."""
    text = text.strip()
    if not text:
        return []
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks: List[str] = []
    for para in paragraphs:
        if len(para) <= MAX_CHARS:
            chunks.append(para)
            continue
        start = 0
        while start < len(para):
            end = start + MAX_CHARS
            chunks.append(para[start:end].strip())
            start = end - OVERLAP
    return chunks
