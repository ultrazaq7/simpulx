"""Segment schema registry (WS-B).

Drives what the Simpuler bot qualifies a lead on, per the conversation's campaign
segment. EVERY segment (automotive included) stores its qualifier fields in
conversations.metadata->'lead_fields'; there are no dedicated automotive columns —
extraction, scoring, grounding, display and export all read lead_fields.

Keys here are the normalized (lowercased) campaign segment labels used in the web
campaign form. An unset/unknown segment behaves exactly like automotive did before
this change, so existing campaigns are not affected.
"""
from __future__ import annotations

AUTOMOTIVE = "automotive"

# Per segment: ordered list of {key, label} the bot qualifies on.
# Automotive is now a segment like any other — its qualifiers live in
# metadata.lead_fields (brand/model/city/purchase_timeframe), NOT in dedicated
# columns, so the platform has ONE segment-agnostic extraction/scoring/display path.
SEGMENT_SCHEMAS: dict[str, list[dict]] = {
    "automotive": [
        {"key": "brand", "label": "Brand"},
        {"key": "model", "label": "Model"},
        {"key": "city", "label": "City"},
        {"key": "purchase_timeframe", "label": "Timeframe"},
    ],
    "property / real estate": [
        {"key": "property_type", "label": "Property type"},
        {"key": "location", "label": "Preferred location"},
        {"key": "budget", "label": "Budget"},
        {"key": "purchase_timeframe", "label": "Timeframe"},
    ],
    "finance": [
        {"key": "product", "label": "Product"},
        {"key": "loan_amount", "label": "Loan amount"},
        {"key": "tenor", "label": "Tenor"},
        {"key": "purpose", "label": "Purpose"},
    ],
    "insurance": [
        {"key": "insurance_type", "label": "Insurance type"},
        {"key": "coverage", "label": "Coverage"},
        {"key": "budget", "label": "Budget"},
    ],
    "retail / fmcg": [
        {"key": "product", "label": "Product"},
        {"key": "quantity", "label": "Quantity"},
        {"key": "budget", "label": "Budget"},
    ],
    "education": [
        {"key": "program", "label": "Program"},
        {"key": "level", "label": "Level"},
        {"key": "intake", "label": "Intake"},
    ],
    "healthcare": [
        {"key": "service", "label": "Service"},
        {"key": "preferred_date", "label": "Preferred date"},
    ],
    "travel & hospitality": [
        {"key": "destination", "label": "Destination"},
        {"key": "dates", "label": "Dates"},
        {"key": "pax", "label": "Travelers"},
        {"key": "budget", "label": "Budget"},
    ],
    "food & beverage": [
        {"key": "item", "label": "Item"},
        {"key": "quantity", "label": "Quantity"},
        {"key": "event_date", "label": "Event date"},
    ],
    "services": [
        {"key": "service", "label": "Service needed"},
        {"key": "location", "label": "Location"},
        {"key": "budget", "label": "Budget"},
    ],
}


# Credit/installment coaching shared by segments that sell on financing
# (automotive, finance). Kept out of the base prompt so non-finance segments
# aren't told about cicilan/tenor/TDP they'll never use.
_CREDIT_RULES = (
    "Soal cicilan/tenor: data katalog memakai satuan BULAN (mis. 12/24/36/48/60 bln). Kalau lead menyebut tenor "
    "dalam TAHUN, konversikan dulu (1 tahun = 12 bulan; '5 taun' = 60 bulan, '3 tahun' = 36 bulan). Kalau katalog "
    "PUNYA baris cicilan untuk tenor itu, SEBUTKAN cicilan & TDP apa adanya beserta DP/TDP yang berlaku; JANGAN "
    "bilang datanya belum ada kalau baris-nya sebenarnya ADA (cuma beda satuan tahun vs bulan). Kalau DP yang "
    "diminta lead beda dari TDP di katalog, beri angka katalog terdekat dulu lalu tawarkan bantu hitung ulang lewat "
    "tim; jangan mengarang angka. "
)

# Neutral guidance for an empty/unknown segment. Deliberately NOT automotive: an
# unset segment must not assume cars, cash/kredit, or cicilan.
GENERIC_NURTURE = (
    "Kumpulkan info kunci yang relevan dengan kebutuhan lead satu per satu: produk/layanan yang diminati, "
    "lokasi/domisili bila relevan, budget/anggaran, dan rencana waktu. Sesuaikan gaya & pertanyaan dengan konteks "
    "bisnis pada system prompt. "
)

# Per-segment nurture guidance: what to qualify on + the selling approach/tone.
# Injected into the reply prompt (see llm.nurture). Automotive is one entry here,
# not the default -- an empty segment falls through to GENERIC_NURTURE.
SEGMENT_NURTURE: dict[str, str] = {
    AUTOMOTIVE: (
        "Kumpulkan info kunci: unit/model yang diminati, kota/domisili, skema (cash atau kredit) & budget, dan "
        "rencana waktu pembelian. Tekankan value unit; kalau relevan tawarkan test drive. " + _CREDIT_RULES
    ),
    "property / real estate": (
        "Kumpulkan info kunci: tipe properti (rumah/apartemen/ruko/tanah), lokasi yang diincar, budget, rencana "
        "waktu, dan skema (KPR atau cash). Tekankan nilai lokasi & potensi investasi; kalau relevan tawarkan jadwal "
        "survei/site visit. "
    ),
    "finance": (
        "Kumpulkan info kunci: produk yang diminati, plafon/jumlah pinjaman, tenor, dan tujuan (mis. modal usaha "
        "atau konsumtif). Fokus ke kelayakan & kecepatan proses; jelaskan syarat umum tanpa menjanjikan approval. "
        + _CREDIT_RULES
    ),
    "insurance": (
        "Kumpulkan info kunci: jenis asuransi (jiwa/kesehatan/kendaraan/properti), cakupan (coverage) yang "
        "diinginkan, dan budget/premi. Jual rasa aman lewat skenario risiko & manfaat, bukan sekadar produk; "
        "tawarkan ilustrasi premi. "
    ),
    "retail / fmcg": (
        "Kumpulkan info kunci: produk yang dicari, jumlah/quantity, dan budget. Transaksional cepat: tekankan "
        "ketersediaan stok, harga grosir/diskon, dan pengiriman. "
    ),
    "education": (
        "Kumpulkan info kunci: program/jurusan yang diminati, jenjang/level, dan intake/gelombang. Jual outcome "
        "(prospek karir, akreditasi) & urgensi gelombang pendaftaran; kalau relevan tawarkan campus tour. "
    ),
    "healthcare": (
        "Kumpulkan info kunci: layanan yang dibutuhkan dan tanggal/waktu preferensi. Jaga privasi & empati, hindari "
        "over-selling; arahkan ke booking jadwal. "
    ),
    "travel & hospitality": (
        "Kumpulkan info kunci: destinasi, tanggal, jumlah orang (pax), dan budget. Jual pengalaman & urgensi wajar "
        "(ketersediaan seat/kamar, musim, harga naik); tawarkan kunci tanggal/booking. "
    ),
    "food & beverage": (
        "Kumpulkan info kunci: item/menu, jumlah/quantity, dan tanggal acara. Event-driven: tekankan paket, tasting, "
        "dan ketersediaan tanggal; arahkan ke DP/booking. "
    ),
    "services": (
        "Kumpulkan info kunci: jasa/layanan yang dibutuhkan, lokasi, dan budget. Diagnosa kebutuhan dulu (scope "
        "sering belum jelas) sebelum kasih penawaran; kalau relevan tawarkan survei/jadwal. "
    ),
}


def _norm(segment) -> str:
    return (segment or "").strip().lower()


def nurture_guidance(segment) -> str:
    """Segment-specific 'info kunci + approach' block for the nurture prompt.
    An empty or unknown segment returns the NEUTRAL guidance -- NOT automotive."""
    return SEGMENT_NURTURE.get(_norm(segment), GENERIC_NURTURE)


def is_automotive(segment) -> bool:
    """Unset/empty segments behave as automotive (the prior, native behaviour)."""
    s = _norm(segment)
    return s == "" or s == AUTOMOTIVE


def fields_for(segment) -> list[dict]:
    # Empty/unset segment behaves as automotive (the historical default).
    key = _norm(segment) or AUTOMOTIVE
    return SEGMENT_SCHEMAS.get(key, [])


def extra_fields_for(segment) -> list[dict]:
    """Fields to extract into metadata.lead_fields — now for EVERY segment,
    including automotive (whose brand/model/city no longer live in dedicated
    columns), so extraction + display + scoring follow ONE segment-agnostic path."""
    return fields_for(segment)


def required_keys(segment) -> list[str]:
    """Keys that mark a non-auto lead 'qualified' (all present -> ready to hand off)."""
    return [f["key"] for f in fields_for(segment)]


# ── Lost-reason taxonomy (segment-aware) ──────────────────────────────────
# Each reason is (value, group). group drives did_purchase downstream:
#   "bought" -> did_purchase=true (the lead bought, just not from us)
#   "nobuy"  -> did_purchase=false (no purchase happened)
# Spam/junk reasons (spam_junk, job_seeker, abusive, ghosted, duplicate,
# wrong_number) are UNIVERSAL and manual-only — they live in the classifier +
# client UI, not here, because they are never business/segment specific.
# _LOST_GENERIC applies to EVERY segment; _SEGMENT_LOST_EXTRA adds the reasons
# that only make sense for a given segment (e.g. trade_in_issue for automotive).
_LOST_GENERIC: list[tuple[str, str]] = [
    ("bought_elsewhere", "bought"),   # bought the same thing from someone else
    ("competitor_promo", "bought"),   # lost to a competitor's price/promo
    ("price_too_high", "nobuy"),
    ("no_budget", "nobuy"),
    ("postponed", "nobuy"),
    ("wrong_product", "nobuy"),
    ("changed_mind", "nobuy"),
    ("out_of_area", "nobuy"),
]

_SEGMENT_LOST_EXTRA: dict[str, list[tuple[str, str]]] = {
    AUTOMOTIVE: [
        ("bought_other_brand", "bought"),
        ("bought_used_car", "bought"),
        ("financing_rejected", "nobuy"),
        ("trade_in_issue", "nobuy"),
    ],
    "property / real estate": [
        ("bought_other_unit", "bought"),
        ("financing_rejected", "nobuy"),   # KPR rejected
        ("location_mismatch", "nobuy"),
    ],
    "finance": [
        ("financing_rejected", "nobuy"),
        ("rate_too_high", "nobuy"),
        ("ineligible", "nobuy"),
    ],
    "insurance": [
        ("already_insured", "bought"),
        ("premium_too_high", "nobuy"),
        ("coverage_insufficient", "nobuy"),
    ],
    "retail / fmcg": [
        ("found_cheaper", "bought"),
        ("out_of_stock", "nobuy"),
    ],
    "education": [
        ("enrolled_elsewhere", "bought"),
        ("program_unavailable", "nobuy"),
        ("schedule_conflict", "nobuy"),
    ],
    "healthcare": [
        ("chose_other_provider", "bought"),
        ("schedule_conflict", "nobuy"),
    ],
    "travel & hospitality": [
        ("booked_elsewhere", "bought"),
        ("dates_unavailable", "nobuy"),
    ],
    "food & beverage": [
        ("chose_other_vendor", "bought"),
        ("date_unavailable", "nobuy"),
    ],
    "services": [
        ("hired_elsewhere", "bought"),
        ("scope_mismatch", "nobuy"),
    ],
}


def lost_reasons(segment) -> list[tuple[str, str]]:
    """Ordered [(value, group)] business lost-reasons valid for this segment
    (generic + segment-specific). Unknown/empty segment -> automotive."""
    key = _norm(segment) or AUTOMOTIVE
    return _LOST_GENERIC + _SEGMENT_LOST_EXTRA.get(key, [])


def lost_reason_values(segment) -> list[str]:
    """Just the enum values for this segment (for the LLM analyze prompt)."""
    return [v for v, _ in lost_reasons(segment)]
