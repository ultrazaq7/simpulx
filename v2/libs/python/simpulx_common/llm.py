"""Abstraksi LLM dengan dua provider:
- mock     : jawaban deterministik offline (tanpa API key) — untuk dev/test.
- anthropic: Claude Messages API dengan prompt caching pada blok system+konteks.

Kontrak keluaran seragam: dict {reply, confidence, need_human}. Confidence dipakai
orchestrator untuk memutuskan reply vs handoff ke manusia.
"""
from __future__ import annotations

import json
from typing import List, Optional, TypedDict

import httpx

from .settings import settings


class LLMResult(TypedDict):
    reply: str
    confidence: float
    need_human: bool
    car_brand: str | None
    car_model: str | None
    city: str | None
    purchase_timeframe: int | None
    interest_level: str | None
    lost_reason: str | None


_INSTRUCTION = (
    "Jawab pertanyaan pelanggan HANYA berdasarkan KONTEKS PENGETAHUAN bila relevan. "
    "Jika informasi tidak ada di konteks atau pertanyaan memerlukan tindakan manusia "
    "(komplain, refund, hal sensitif), set need_human=true. "
    "Selain membalas, ekstrak data prospek dari percakapan jika ada: car_brand, car_model, city, purchase_timeframe, interest_level. "
    "Aturan formatting ketat: "
    "1. purchase_timeframe HARUS berupa angka integer (dalam satuan hari), misal 'bulan depan' menjadi 30, 'minggu depan' menjadi 7, 'besok' menjadi 1. "
    "2. interest_level HARUS berupa string 'hot', 'warm', atau 'cold'. (hot = siap beli segera, warm = tanya detail harga/promo, cold = hanya tanya ringan). "
    "Jika pelanggan menyatakan tidak tertarik atau batal beli, isi lost_reason dengan alasannya. Jika data tidak disebutkan, isi null. "
    'Balas dalam format JSON ketat: {"reply": string, "confidence": number, "need_human": boolean, "car_brand": string|null, "car_model": string|null, "city": string|null, "purchase_timeframe": number|null, "interest_level": string|null, "lost_reason": string|null}.'
)


def _build_context_block(chunks: List[str]) -> str:
    if not chunks:
        return "KONTEKS PENGETAHUAN: (kosong)"
    joined = "\n\n".join(f"- {c}" for c in chunks)
    return f"KONTEKS PENGETAHUAN:\n{joined}"


def _mock_generate(chunks: List[str], user_message: str) -> LLMResult:
    if chunks:
        snippet = chunks[0].strip().replace("\n", " ")
        if len(snippet) > 240:
            snippet = snippet[:240] + "..."
        return LLMResult(
            reply=f"{snippet}",
            confidence=0.85,
            need_human=False,
            car_brand=None,
            car_model=None,
            city=None,
            purchase_timeframe=None,
            interest_level=None,
            lost_reason=None,
        )
    # Tanpa konteks: confidence rendah -> orchestrator akan handoff.
    return LLMResult(
        reply="Maaf, saya belum punya informasi itu. Saya alihkan ke rekan kami ya.",
        confidence=0.40,
        need_human=True,
        car_brand=None,
        car_model=None,
        city=None,
        purchase_timeframe=None,
        interest_level=None,
        lost_reason=None,
    )


async def _anthropic_generate(
    system_prompt: str, chunks: List[str], history: List[dict], user_message: str, model: Optional[str] = None
) -> LLMResult:
    context_block = _build_context_block(chunks)
    system = [
        {"type": "text", "text": system_prompt + "\n\n" + _INSTRUCTION},
        # Blok konteks di-cache (prompt caching) — hemat token bila dipakai ulang.
        {"type": "text", "text": context_block, "cache_control": {"type": "ephemeral"}},
    ]
    messages = list(history) + [{"role": "user", "content": user_message}]

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": settings.anthropic_api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": model or settings.llm_model,
                "max_tokens": 1024,
                "system": system,
                "messages": messages,
            },
        )
        resp.raise_for_status()
        data = resp.json()
    text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
    return _parse_json_reply(text)


def _parse_json_reply(text: str) -> LLMResult:
    """Parse keluaran JSON model; fallback aman bila tidak valid."""
    try:
        start = text.index("{")
        end = text.rindex("}") + 1
        obj = json.loads(text[start:end])
        return LLMResult(
            reply=str(obj.get("reply", "")).strip() or "Maaf, bisa diulangi?",
            confidence=float(obj.get("confidence", 0.5)),
            need_human=bool(obj.get("need_human", False)),
            car_brand=obj.get("car_brand"),
            car_model=obj.get("car_model"),
            city=obj.get("city"),
            purchase_timeframe=obj.get("purchase_timeframe"),
            interest_level=obj.get("interest_level"),
            lost_reason=obj.get("lost_reason"),
        )
    except Exception:  # noqa: BLE001
        # Model membalas teks biasa — anggap reply langsung, confidence sedang.
        return LLMResult(
            reply=text.strip() or "Maaf, bisa diulangi?", 
            confidence=0.6, 
            need_human=False,
            car_brand=None,
            car_model=None,
            city=None,
            purchase_timeframe=None,
            interest_level=None,
            lost_reason=None,
        )


async def generate(
    system_prompt: str,
    chunks: List[str],
    history: Optional[List[dict]],
    user_message: str,
    model: Optional[str] = None,
) -> LLMResult:
    history = history or []
    if settings.llm_provider == "anthropic" and settings.anthropic_api_key:
        return await _anthropic_generate(system_prompt, chunks, history, user_message, model)
    return _mock_generate(chunks, user_message)
