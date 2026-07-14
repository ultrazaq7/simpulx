"""Segment schema registry (WS-B).

Drives what the Simpuler bot qualifies a lead on, per the conversation's campaign
segment. AUTOMOTIVE is native: its fields live in dedicated conversation columns
(car_brand/car_model/city/purchase_timeframe) and the extraction path is UNCHANGED.
Every other segment stores its qualifiers in conversations.metadata->'lead_fields'.

Keys here are the normalized (lowercased) campaign segment labels used in the web
campaign form. An unset/unknown segment behaves exactly like automotive did before
this change, so existing campaigns are not affected.
"""
from __future__ import annotations

AUTOMOTIVE = "automotive"

# Per segment: ordered list of {key, label} the bot qualifies on.
SEGMENT_SCHEMAS: dict[str, list[dict]] = {
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
    return SEGMENT_SCHEMAS.get(_norm(segment), [])


def extra_fields_for(segment) -> list[dict]:
    """Non-native fields to extract into metadata.lead_fields. Empty for
    automotive/unset so the live extraction path stays byte-for-byte identical."""
    if is_automotive(segment):
        return []
    return fields_for(segment)


def required_keys(segment) -> list[str]:
    """Keys that mark a non-auto lead 'qualified' (all present -> ready to hand off)."""
    return [f["key"] for f in fields_for(segment)]
