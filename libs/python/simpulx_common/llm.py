"""Abstraksi LLM (chat = Anthropic only). Dua entry point yang fokus & hemat:

- analyze()       : dipakai pada pesan masuk. Ekstrak field prospek + ringkasan +
                    saran follow-up. TIDAK menghasilkan balasan chat (path inbound
                    tak memakai reply -> hemat output token).
- draft_followup(): dipakai worker follow-up. HANYA menghasilkan satu pesan
                    follow-up singkat.

Hemat: model default Sonnet (lihat settings), blok instruksi statis di-cache
(prompt caching), history dipangkas, max_tokens kecil, usage token di-log.
Provider 'mock' memberi jawaban deterministik tanpa API key (dev/test).
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import AsyncIterator, List, Optional

import httpx

from .settings import settings

log = logging.getLogger("llm")

# Anthropic-compatible messages endpoint (direct, or via a configured gateway).
_URL = settings.anthropic_base_url.rstrip("/") + "/v1/messages"
_HEADERS_VERSION = "2023-06-01"

# Appended to every customer-facing instruction. Emoji read as unprofessional in a
# B2B/dealer context, so the AI must never use them in messages it sends.
NO_EMOJI_RULE = (
    " JANGAN gunakan emoji, emotikon, atau kaomoji apa pun (mis. 🔥, ❄️, 😊). "
    "Tulis dengan bahasa yang bersih dan profesional. Do not use any emoji."
)

# Instruksi statis (di-cache). analyze: ekstraksi + ringkasan untuk agent (BUKAN
# untuk pelanggan). interest_level tetap milik rule classifier, jadi tak diminta.
ANALYZE_INSTRUCTION = (
    "Tugasmu: baca percakapan lalu (1) ekstrak data prospek dan (2) buat ringkasan "
    "untuk sales (BUKAN balasan ke pelanggan). JANGAN menulis balasan chat.\n"
    "Aturan: purchase_timeframe = integer hari ('bulan depan'->30, 'minggu depan'->7, "
    "'besok'->1). Jika lead LOST/batal beli, isi lost_reason HANYA dari enum ini: "
    "bought_other_brand | bought_used_car | bought_elsewhere | competitor_promo | out_of_area | "
    "price_too_high | financing_rejected | no_budget | postponed | wrong_product | changed_mind | "
    "trade_in_issue. Jika belum lost, lost_reason=null. Data tak disebut -> null.\n"
    "Ringkasan untuk sales SEMUA dalam Bahasa Indonesia:\n"
    "- summary: 1-3 kalimat inti kebutuhan customer (mobil diminati, budget/DP, "
    "financing, pertanyaan utama).\n"
    "- priority: 'high' | 'medium' | 'low' (high=sinyal beli kuat/siap closing, "
    "medium=menimbang, low=basa-basi/off-topic).\n"
    "- recommended_action: 'call' | 'message' | 'wait' | 'handoff' (saran tindakan, "
    "BUKAN auto-eksekusi).\n"
    "- action_reason: 1 kalimat alasan.\n"
    "- action_confidence: angka 0..1.\n"
    'Balas HANYA JSON: {"car_brand": string|null, "car_model": string|null, '
    '"city": string|null, "purchase_timeframe": number|null, "lost_reason": string|null, '
    '"summary": string|null, "priority": string|null, "recommended_action": string|null, '
    '"action_reason": string|null, "action_confidence": number|null}.'
)

SUMMARY_INSTRUCTION = (
    "Baca percakapan WhatsApp penjualan ini lalu tulis briefing SINGKAT untuk sales "
    "(BUKAN balasan ke pelanggan). Tulis dalam BAHASA YANG SAMA dengan yang dipakai "
    "customer di percakapan (deteksi otomatis: Indonesia/Inggris/dll).\n"
    "FORMAT: 3-5 poin bullet. Satu poin per baris, tiap baris diawali tepat '- ' "
    "(tanda minus + spasi). Tiap poin maksimal 1 kalimat ringkas. JANGAN pakai "
    "heading, paragraf pembuka, penomoran, atau markdown (tanpa **, #, dsb).\n"
    "Cakup: situasi & kebutuhan utama customer; data yang sudah diketahui "
    "(mobil/brand/model, budget/DP, financing, kota, timeframe) dan yang masih kurang. "
    "Poin TERAKHIR selalu berisi rekomendasi tindakan berikutnya untuk sales.\n"
    "JANGAN gunakan em dash (—) atau en dash (–); pakai koma atau titik."
)

_MOCK_SUMMARY = (
    "- Customer is exploring options and has shared only partial details so far.\n"
    "- Car preference, budget, and purchase timeframe are not captured yet.\n"
    "- Next: reach out with a direct, friendly question to qualify intent and fill the gaps."
)

# On-demand draft of the next reply to SEND to the customer (composer 'AI Smart
# Reply'). Plain message text, customer's language, no JSON/labels.
REPLY_INSTRUCTION = (
    "Tugasmu: tulis SATU balasan WhatsApp berikutnya untuk DIKIRIM ke customer "
    "(ini balasan ke pelanggan, BUKAN ringkasan untuk sales). Tulis dalam BAHASA "
    "YANG SAMA dengan yang dipakai customer di percakapan (deteksi otomatis: "
    "Indonesia/Inggris/dll).\n"
    "Gaya: natural, ramah, profesional, singkat (1-3 kalimat). Jawab pertanyaan "
    "customer yang belum terjawab dan teruskan percakapan secara relevan; bila "
    "perlu ajukan satu pertanyaan kualifikasi yang wajar.\n"
    "JANGAN pakai placeholder seperti [nama] atau tanda kurung siku. JANGAN bungkus "
    "dengan tanda kutip. JANGAN pakai em dash (—) atau en dash (–). Tulis HANYA "
    "teks balasannya, tanpa label, tanpa penjelasan."
    + NO_EMOJI_RULE
)

_MOCK_REPLY = (
    "Halo kak, terima kasih sudah menghubungi kami. Boleh dibantu, untuk unit yang "
    "mana yang sedang kakak pertimbangkan? Nanti saya bantu siapkan detail dan simulasinya."
)

# App UI language -> human name used as the summary's fallback language (when the
# conversation language can't be detected). Defaults to English.
_LANG_NAMES = {"en": "English", "id": "Bahasa Indonesia"}


def _lang_name(code: Optional[str]) -> str:
    return _LANG_NAMES.get((code or "id").strip().lower()[:2], "Bahasa Indonesia")

FOLLOWUP_INSTRUCTION = (
    "INSTRUKSI: Buat satu pesan AUTO FOLLOW-UP WhatsApp yang natural, singkat, "
    "ramah, tidak memaksa, dalam Bahasa Indonesia seperti sales mobil profesional "
    "yang menanyakan kelanjutan ketertarikan lead."
    + NO_EMOJI_RULE +
    ' Balas HANYA JSON: {"reply": string}.'
)


def _parse_json(text: str) -> dict:
    try:
        return json.loads(text[text.index("{"): text.rindex("}") + 1])
    except Exception:  # noqa: BLE001
        return {}


async def _anthropic_call(system_blocks: list, history: List[dict],
                          user_message: str, model: str, max_tokens: int) -> dict:
    messages = list(history) + [{"role": "user", "content": user_message}]
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            _URL,
            headers={"x-api-key": settings.anthropic_api_key,
                     "anthropic-version": _HEADERS_VERSION, "content-type": "application/json"},
            json={"model": model, "max_tokens": max_tokens,
                  "system": system_blocks, "messages": messages},
        )
        resp.raise_for_status()
        data = resp.json()
    u = data.get("usage", {})
    log.info("llm usage model=%s in=%s out=%s cache_read=%s cache_write=%s",
             model, u.get("input_tokens"), u.get("output_tokens"),
             u.get("cache_read_input_tokens"), u.get("cache_creation_input_tokens"))
    text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
    return _parse_json(text)


CATALOG_EXTRACT_INSTRUCTION = (
    "Kamu mengekstrak DAFTAR item dari dokumen pricelist/katalog (brosur, daftar harga). "
    "Untuk SETIAP item/baris keluarkan objek dengan field: "
    "item_name (nama produk/unit, WAJIB), variant_name, location_name (kota/area), "
    "category_type, headline_price (harga utama sebagai INTEGER tanpa titik/koma/simbol), "
    "attributes (objek berisi field relevan lain: dp, tenor, emi/cicilan, ukuran, dsb; nilai apa adanya). "
    "Data yang tidak ada -> null. Balas HANYA JSON valid: {\"rows\": [ {..} ]}. "
    "Jika dokumen scan tanpa teks terbaca, balas {\"rows\": [], \"warning\": \"scanned\"}."
)


async def extract_catalog(pdf_b64: str, segment: Optional[str] = None,
                          model: Optional[str] = None) -> dict:
    """Extract catalog/pricelist rows from a PDF via Claude's document input (WS-A).
    Returns {"rows": [...], "warning": str|None}. Rows match campaign_catalog's shape."""
    if not (settings.llm_provider == "anthropic" and settings.anthropic_api_key):
        return {"rows": [], "warning": "no_llm"}
    hint = f" Segmen bisnis: {segment}." if segment else ""
    content = [
        {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": pdf_b64}},
        {"type": "text", "text": CATALOG_EXTRACT_INSTRUCTION + hint},
    ]
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            _URL,
            headers={"x-api-key": settings.anthropic_api_key,
                     "anthropic-version": _HEADERS_VERSION, "content-type": "application/json"},
            json={"model": model or settings.llm_model, "max_tokens": 4096,
                  "messages": [{"role": "user", "content": content}]},
        )
        resp.raise_for_status()
        data = resp.json()
    u = data.get("usage", {})
    log.info("catalog extract usage in=%s out=%s", u.get("input_tokens"), u.get("output_tokens"))
    text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
    obj = _parse_json(text)
    if not isinstance(obj, dict):
        return {"rows": [], "warning": "parse_failed"}
    rows = obj.get("rows")
    return {"rows": rows if isinstance(rows, list) else [], "warning": obj.get("warning")}


def _as_int(v):
    try:
        return int(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def _as_float(v):
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def _extra_fields_instruction(extra_fields: List[dict]) -> str:
    """Appended ONLY for non-automotive segments (WS-B). Automotive passes no
    extra_fields, so the base instruction (and its cache prefix) is unchanged."""
    labels = "; ".join(f'{f["key"]} = {f["label"]}' for f in extra_fields)
    keys = ", ".join(f'"{f["key"]}"' for f in extra_fields)
    return (
        "\nTAMBAHAN EKSTRAKSI: selain field di atas, ekstrak juga data prospek berikut "
        f"({labels}). Sertakan sebagai objek \"fields\" pada JSON, berisi key: {keys}. "
        "Nilai = string ringkas apa adanya dari percakapan, atau null bila tak disebut."
    )


def _shape_analyze(obj: dict, extra_fields: Optional[List[dict]] = None) -> dict:
    ptf = _as_int(obj.get("purchase_timeframe"))
    out = {
        "car_brand": obj.get("car_brand"),
        "car_model": obj.get("car_model"),
        "city": obj.get("city"),
        "purchase_timeframe": ptf,
        "lost_reason": obj.get("lost_reason"),
        "summary": obj.get("summary"),
        "priority": obj.get("priority"),
        "recommended_action": obj.get("recommended_action"),
        "action_reason": obj.get("action_reason"),
        "action_confidence": _as_float(obj.get("action_confidence")),
    }
    if extra_fields:
        raw = obj.get("fields")
        allowed = {f["key"] for f in extra_fields}
        out["fields"] = {k: v for k, v in raw.items() if k in allowed and v not in (None, "")} if isinstance(raw, dict) else {}
    return out


def _mock_analyze(user_message: str) -> dict:
    snippet = (user_message or "").strip().replace("\n", " ")[:160] or None
    return {
        "car_brand": None, "car_model": None, "city": None,
        "purchase_timeframe": None, "lost_reason": None,
        "summary": snippet, "priority": "medium", "recommended_action": "message",
        "action_reason": "Mock recommendation (no live LLM).", "action_confidence": 0.5,
    }


async def analyze(system_prompt: str, history: Optional[List[dict]],
                  user_message: str, model: Optional[str] = None,
                  extra_fields: Optional[List[dict]] = None) -> dict:
    """Ekstraksi field + ringkasan/saran untuk sales. Tanpa balasan chat.

    extra_fields (WS-B): non-automotive segment fields to ALSO extract, returned
    under result["fields"]. When None/empty (automotive or unset segment) the
    prompt, its cache prefix, and the result shape are all UNCHANGED."""
    if not (settings.llm_provider == "anthropic" and settings.anthropic_api_key):
        return _mock_analyze(user_message)
    # Static per-agent prefix (system_prompt + instruksi) di-cache -> hemat input
    # token lintas pesan untuk agent yang sama.
    instruction = ANALYZE_INSTRUCTION
    if extra_fields:
        instruction += _extra_fields_instruction(extra_fields)
    system = [{
        "type": "text",
        "text": (system_prompt or "You are a helpful sales assistant.") + "\n\n" + instruction,
        "cache_control": {"type": "ephemeral"},
    }]
    obj = await _anthropic_call(system, history or [], user_message, model or settings.llm_model, 400)
    return _shape_analyze(obj, extra_fields)


async def stream_summary(system_prompt: str, history: Optional[List[dict]],
                         model: Optional[str] = None,
                         app_lang: Optional[str] = None) -> AsyncIterator[str]:
    """Stream a sales briefing for the active conversation, chunk by chunk.
    Generated fresh on demand (agent clicks 'AI Smart Summary'). Language follows
    the conversation; the fallback (when undetectable) follows the app UI language
    (app_lang, default English). Falls back to a mock stream without a live LLM."""
    if not (settings.llm_provider == "anthropic" and settings.anthropic_api_key):
        for word in _MOCK_SUMMARY.split(" "):
            yield word + " "
            await asyncio.sleep(0.03)
        return

    fallback_rule = (
        f"\nJika bahasa percakapan tidak jelas atau tidak ada teks dari customer, "
        f"tulis dalam {_lang_name(app_lang)}."
    )
    system = [{
        "type": "text",
        "text": (system_prompt or "You are a helpful sales assistant.") + "\n\n" + SUMMARY_INSTRUCTION + fallback_rule,
        "cache_control": {"type": "ephemeral"},
    }]
    messages = list(history or []) + [{"role": "user", "content": "Write the sales briefing now."}]
    payload = {
        "model": model or settings.llm_model,
        "max_tokens": 600,
        "system": system,
        "messages": messages,
        "stream": True,
    }
    headers = {
        "x-api-key": settings.anthropic_api_key,
        "anthropic-version": _HEADERS_VERSION,
        "content-type": "application/json",
    }
    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream("POST", _URL, headers=headers, json=payload) as resp:
            if resp.status_code >= 400:
                body = (await resp.aread()).decode("utf-8", "ignore")
                log.error("summary stream http %s: %s", resp.status_code, body[:300])
                raise httpx.HTTPStatusError(
                    f"summary stream {resp.status_code}", request=resp.request, response=resp)
            async for line in resp.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[len("data:"):].strip()
                if not data:
                    continue
                try:
                    evt = json.loads(data)
                except Exception:  # noqa: BLE001
                    continue
                etype = evt.get("type")
                if etype == "content_block_delta":
                    delta = evt.get("delta") or {}
                    if delta.get("type") == "text_delta":
                        text = delta.get("text") or ""
                        if text:
                            yield text
                elif etype == "message_stop":
                    break


async def stream_reply(system_prompt: str, history: Optional[List[dict]],
                       model: Optional[str] = None,
                       app_lang: Optional[str] = None) -> AsyncIterator[str]:
    """Stream a suggested next reply to SEND to the customer, chunk by chunk.
    One-shot suggestion for the composer's 'AI Smart Reply' (not persisted).
    Language follows the conversation; fallback follows app_lang. Mock without a
    live LLM."""
    if not (settings.llm_provider == "anthropic" and settings.anthropic_api_key):
        for word in _MOCK_REPLY.split(" "):
            yield word + " "
            await asyncio.sleep(0.03)
        return

    fallback_rule = (
        f"\nJika bahasa percakapan tidak jelas atau tidak ada teks dari customer, "
        f"tulis dalam {_lang_name(app_lang)}."
    )
    system = [{
        "type": "text",
        "text": (system_prompt or "You are a helpful sales assistant.") + "\n\n" + REPLY_INSTRUCTION + fallback_rule,
        "cache_control": {"type": "ephemeral"},
    }]
    # When the last turn is the customer's, let the model reply directly; otherwise
    # nudge it (avoids two consecutive user turns, which the API rejects).
    msgs = list(history or [])
    if not msgs or msgs[-1].get("role") != "user":
        msgs.append({"role": "user", "content": "Write the next reply to send now."})
    payload = {
        "model": model or settings.llm_model,
        "max_tokens": 400,
        "system": system,
        "messages": msgs,
        "stream": True,
    }
    headers = {
        "x-api-key": settings.anthropic_api_key,
        "anthropic-version": _HEADERS_VERSION,
        "content-type": "application/json",
    }
    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream("POST", _URL, headers=headers, json=payload) as resp:
            if resp.status_code >= 400:
                body = (await resp.aread()).decode("utf-8", "ignore")
                log.error("reply stream http %s: %s", resp.status_code, body[:300])
                raise httpx.HTTPStatusError(
                    f"reply stream {resp.status_code}", request=resp.request, response=resp)
            async for line in resp.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[len("data:"):].strip()
                if not data:
                    continue
                try:
                    evt = json.loads(data)
                except Exception:  # noqa: BLE001
                    continue
                etype = evt.get("type")
                if etype == "content_block_delta":
                    delta = evt.get("delta") or {}
                    if delta.get("type") == "text_delta":
                        text = delta.get("text") or ""
                        if text:
                            yield text
                elif etype == "message_stop":
                    break


def _followup_tone(touch: int) -> str:
    """Vary the copy by touch number (WS-E). Touch 1 keeps the base instruction
    identical (cache-safe); later touches shift the angle so repeat nudges to a
    silent lead don't read like the same message twice."""
    if touch <= 1:
        return ""
    if touch == 2:
        return (" Ini follow-up KEDUA (lead belum membalas follow-up sebelumnya): ganti "
                "sudut pesan, jangan mengulang kalimat yang sama, tawarkan bantuan konkret "
                "(mis. simulasi cicilan, unit ready, atau jadwal), tetap sopan dan singkat.")
    return (" Ini follow-up TERAKHIR (lead beberapa kali tidak membalas): sampaikan dengan "
            "sopan bahwa kamu menutup percakapan untuk sekarang, tetapi tetap terbuka kapan "
            "pun mereka ingin melanjutkan. Singkat, tanpa memaksa.")


async def draft_followup(system_prompt: str, history: Optional[List[dict]],
                         user_message: str, model: Optional[str] = None, touch: int = 1) -> str:
    """Hasilkan satu pesan follow-up singkat. Mengembalikan string reply."""
    if not (settings.llm_provider == "anthropic" and settings.anthropic_api_key):
        return "Halo kak, masih berminat dengan unitnya? Ada yang bisa kami bantu?"
    system = [{
        "type": "text",
        "text": (system_prompt or "You are a helpful sales assistant.") + "\n\n" + FOLLOWUP_INSTRUCTION + _followup_tone(touch),
        "cache_control": {"type": "ephemeral"},
    }]
    obj = await _anthropic_call(system, history or [], user_message, model or settings.llm_model, 256)
    return (obj.get("reply") or "").strip()


NURTURE_INSTRUCTION = (
    "INSTRUKSI: Kamu me-nurture lead lewat WhatsApp sebagai sales assistant. "
    "Balas natural, ramah, dan SINGKAT (1-3 kalimat), tidak memaksa. "
    "Kumpulkan info kunci yang BELUM diketahui satu per satu (jangan bertubi-tubi): "
    "unit/produk yang diminati, kota/domisili, skema (cash atau kredit) & budget, dan rencana waktu pembelian. "
    "Tanyakan HANYA satu hal per pesan. Jangan mengarang harga/promo yang tidak kamu ketahui. "
    "Set ready_for_handoff=true HANYA jika: info kunci sudah lengkap, ATAU lead minta bicara dengan sales/manusia, "
    "ATAU lead siap bertransaksi (mis. mau test drive, nego harga, atau DP)."
    + NO_EMOJI_RULE +
    ' Balas HANYA JSON: {"reply": string, "ready_for_handoff": boolean}.'
)


async def nurture(system_prompt: str, history: Optional[List[dict]],
                  user_message: str, model: Optional[str] = None) -> dict:
    """Generate one nurture reply + a handoff decision.
    Returns {"reply": str, "ready_for_handoff": bool}."""
    if not (settings.llm_provider == "anthropic" and settings.anthropic_api_key):
        return {"reply": "Halo kak, boleh dibantu ya. Unit apa yang lagi dicari, dan domisili di kota mana?",
                "ready_for_handoff": False}
    system = [{
        "type": "text",
        "text": (system_prompt or "You are a helpful sales assistant.") + "\n\n" + NURTURE_INSTRUCTION,
        "cache_control": {"type": "ephemeral"},
    }]
    obj = await _anthropic_call(system, history or [], user_message, model or settings.llm_model, 400)
    return {"reply": (obj.get("reply") or "").strip(),
            "ready_for_handoff": bool(obj.get("ready_for_handoff"))}
