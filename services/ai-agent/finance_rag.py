"""Retrieval Khusus untuk Simulasi Kredit (Finance Packages)."""
from __future__ import annotations

import logging
import re
from contextlib import asynccontextmanager

log = logging.getLogger("finance-rag")


@asynccontextmanager
async def _acquire(pool, conn):
    """Yield `conn` if the caller passed one (reuse it, e.g. the connection holding
    the nurture advisory lock), otherwise acquire and release a fresh pooled one."""
    if conn is not None:
        yield conn
    else:
        async with pool.acquire() as c:
            yield c


async def get_catalog_context(pool, campaign_id, brand: str, model: str,
                              city: str = None, segment: str = None,
                              query: str = None, conn=None) -> str | None:
    """Segment-generic, CAMPAIGN-SCOPED catalog lookup (WS-A).

    Tries the per-campaign campaign_catalog first so one campaign never grounds
    on another's pricing (fixes the global finance_packages cross-dealer leak).
    If the campaign has no catalog rows -- or anything goes wrong -- it FALLS BACK
    to the legacy global finance_packages lookup, so the live bot never loses its
    grounding. Safe to swap in for get_finance_context at any call site that has
    the conversation's campaign_id in scope.

    `query` is the customer's latest message: when they name a specific trim
    ("Ultimate"), the matching rows are floated to the top so the model answers
    from THAT variant instead of the cheapest one it happens to see.
    """
    if campaign_id:
        try:
            ctx = await _catalog_from_table(pool, campaign_id, brand, model, city, query, conn=conn)
            if ctx:
                return ctx
        except Exception as e:  # never let the new path break grounding
            log.warning(f"campaign_catalog lookup failed, falling back: {e}")
    # Fallback: legacy global finance_packages (automotive only).
    return await get_finance_context(pool, brand, model, city, conn=conn)


# Transmission / drivetrain / generic spec tokens that appear inside variant
# names but DON'T identify a specific trim, so they must not trigger a variant
# match on their own (e.g. "Exceed CVT" shouldn't be picked just because the
# customer typed "cvt"; only a real trim word like "exceed"/"ultimate"/"gl" should).
_GENERIC_VARIANT_TOKENS = {
    "cvt", "at", "mt", "matic", "manual", "automatic", "ds", "cbu", "ckd",
    "4x2", "4x4", "2wd", "4wd", "awd", "fwd", "rwd", "mpv", "suv", "cc",
}


def _variant_hits(query: str, rows) -> list:
    """Rows whose variant/item the customer explicitly named. Matches on each
    significant TRIM token of variant_name (e.g. 'ultimate', 'exceed', 'gls', 'gl')
    as a whole word, so 'kalo ultimate otrnya berapa' hits the 'Ultimate' row and
    not just the alphabetically/cheapest-first one. Generic transmission/spec
    tokens are skipped so they never trigger a false variant match."""
    if not query:
        return []
    q = f" {query.lower()} "
    hits = []
    for r in rows:
        name = " ".join(x for x in (r["variant_name"], r["item_name"]) if x).strip().lower()
        toks = [tk for tk in re.split(r"[\s/()-]+", name)
                if len(tk) >= 2 and tk not in _GENERIC_VARIANT_TOKENS]
        if any(f" {tk} " in q for tk in toks):
            hits.append(r)
    return hits


async def _catalog_from_table(pool, campaign_id, brand: str, model: str,
                              city: str = None, query: str = None, conn=None) -> str | None:
    """Query campaign_catalog for one campaign, matching item/variant on the
    lead's brand/model. Formats rows segment-agnostically (spine columns +
    whatever segment-specific keys sit in the attributes jsonb).

    When brand/model aren't extracted yet the whole (campaign-scoped) catalog is
    returned so even the FIRST turn is grounded; a named trim in `query` is then
    used to rank so the customer's exact variant leads."""
    needle = (model or brand or "").strip()
    like = f"%{needle}%" if needle else "%"
    async with _acquire(pool, conn) as conn:
        rows = await conn.fetch(
            """SELECT item_name, variant_name, location_name, category_type,
                      headline_price, attributes
                 FROM campaign_catalog
                WHERE campaign_id = $1::uuid
                  AND ($2 = '%' OR item_name ILIKE $2 OR variant_name ILIKE $2
                       OR ($3 <> '' AND $3 ILIKE '%' || item_name || '%'))
                ORDER BY item_name NULLS LAST, variant_name NULLS LAST, headline_price ASC NULLS LAST
                LIMIT 300""",
            campaign_id, like, needle,
        )
    if not rows:
        return None
    rows = list(rows)

    # Collapse credit rows to ONE entry per variant (item+variant+location). Each
    # catalog row is a single (variant x tenor), so a trim is 5+ rows sharing one OTR;
    # grouping first makes the injection budget count VARIANTS, not tenor-copies of the
    # cheapest trim (which used to crowd every other trim out of the model's context).
    _groups: dict = {}
    _order: list = []
    for r in rows:
        k = (r["item_name"] or "", r["variant_name"] or "", r["location_name"] or "")
        g = _groups.get(k)
        if g is None:
            g = {"item_name": r["item_name"], "variant_name": r["variant_name"],
                 "location_name": r["location_name"], "category_type": r["category_type"],
                 "headline_price": r["headline_price"], "attributes": r["attributes"] or {},
                 "tenors": []}
            _groups[k] = g
            _order.append(k)
        a = r["attributes"] or {}
        if isinstance(a, dict) and a.get("tenor") not in (None, ""):
            g["tenors"].append(a)
    rows = [_groups[k] for k in _order]

    # If the customer named a specific trim, answer from THAT trim (city-preferred
    # within it if possible). This must win over the plain city preference so a
    # lead asking about "Ultimate" is never quoted the cheaper "Exceed" price.
    focus_note = None
    hits = _variant_hits(query, rows)
    if hits:
        if city:
            cl = city.strip().lower()
            city_hits = [r for r in hits if r["location_name"] and cl in r["location_name"].lower()]
            hits = city_hits or hits
        rest = [r for r in rows if r not in hits]
        rows = hits + rest
        focus_note = ("Customer menyebut varian/tipe spesifik; baris yang cocok sudah diletakkan "
                      "PALING ATAS. Jawab pakai baris itu, jangan pakai varian lain.")
    elif city:
        # No specific trim named: keep the plain city preference (else keep all).
        cl = city.strip().lower()
        pref = [r for r in rows if r["location_name"] and cl in r["location_name"].lower()]
        if pref:
            rows = pref

    # Bound what we inject (ranking already put the relevant variants first).
    rows = rows[:14]

    def rupiah(v):
        try:
            return f"Rp {int(v):,}".replace(",", ".")
        except (TypeError, ValueError):
            return None

    lines = ["[INFO KATALOG / HARGA TERBARU YANG TERSEDIA DI DATABASE (Tawarkan Jika Relevan)]:"]
    for i, r in enumerate(rows, 1):
        parts = [r["item_name"] or ""]
        if r["variant_name"]:
            parts.append(r["variant_name"])
        if r["location_name"]:
            parts.append(f"({r['location_name']})")
        price = rupiah(r["headline_price"])
        if price:
            parts.append(f"| OTR: {price}")
        # Compact credit options collapsed from the per-tenor rows (tenor -> monthly
        # installment [+ TDP]), so one variant stays one line.
        tenors = sorted((a for a in r.get("tenors", []) if isinstance(a, dict)),
                        key=lambda a: int(a.get("tenor") or 0))
        if tenors:
            sim = ", ".join(
                f"{a.get('tenor')}bln {rupiah(a.get('angsuran')) or a.get('angsuran')}"
                + (f"/TDP {rupiah(a.get('tdp'))}" if a.get("tdp") not in (None, '') else "")
                for a in tenors if a.get("angsuran") not in (None, ""))
            if sim:
                parts.append(f"| Cicilan: {sim}")
        else:
            # Non-credit segments: surface whatever attributes exist (dp, size, ...).
            attrs = r["attributes"] or {}
            if isinstance(attrs, dict):
                for k, v in attrs.items():
                    if v in (None, ""):
                        continue
                    money = rupiah(v) if k in ("dp", "dp_amount", "emi", "plafon", "otr_price", "price") else None
                    parts.append(f"| {k}: {money or v}")
        lines.append("  " + f"{i}. " + " ".join(str(p) for p in parts if p))
    lines.append("CATATAN VARIAN: Daftar di atas memuat SEMUA varian/tipe yang tersedia untuk model & area ini. "
                 "Untuk 'tipe tertinggi/termahal' pilih OTR TERBESAR; 'termurah/entry-level' pilih OTR terkecil. "
                 "Jika varian yang ditanya ADA di daftar, harganya TERSEDIA -- jangan bilang belum ada data.")
    if focus_note:
        lines.append("CATATAN FOKUS: " + focus_note)
    lines.append("CATATAN UNTUK AI: Jika customer bertanya tentang harga/DP/cicilan, GUNAKAN angka dari atas persis untuk varian yang ditanya. "
                 "Jika varian yang ditanya TIDAK ADA di daftar, katakan datanya belum tersedia dan tawarkan cek ke tim; jangan buat estimasi atau pakai harga varian lain.")
    return "\n".join(lines)

async def get_finance_context(pool, brand: str, model: str, city: str = None, conn=None) -> str | None:
    """
    Mencari paket kredit yang cocok di tabel finance_packages
    berdasarkan brand dan model (dan opsional city).
    Mengembalikan string context untuk disuntikkan ke prompt LLM.
    """
    if not brand and not model:
        return None
        
    # ILIKE patterns (case-insensitive). The DB stores the BASE model ("Brio"),
    # while a lead usually gives a variant ("Brio RS"). So besides the normal
    # match, also match when the searched model CONTAINS the stored model_name
    # (reverse match) — otherwise "Brio RS" never matches "Brio" and no finance
    # context is injected. Order by variant so specific trims (e.g. RS) surface.
    b_pattern = f"%{brand.strip()}%" if brand else "%"
    m_pattern = f"%{model.strip()}%" if model else "%"
    m_raw = model.strip() if model else ""

    cols = ("brand_name, model_name, variant_name, city_name, otr_price, "
            "dp_amount, tenor_months, emi, package_name")
    model_cond = ("(model_name ILIKE $2 "
                  "OR ($3 <> '' AND $3 ILIKE '%' || model_name || '%'))")

    try:
        async with _acquire(pool, conn) as conn:
            rows = []
            if city:
                rows = await conn.fetch(
                    f"SELECT {cols} FROM finance_packages "
                    f"WHERE brand_name ILIKE $1 AND {model_cond} AND city_name ILIKE $4 "
                    f"ORDER BY variant_name, dp_amount ASC LIMIT 8",
                    b_pattern, m_pattern, m_raw, f"%{city.strip()}%",
                )
            # Fallback: no city / nothing in that city -> drop the city filter.
            if not rows:
                rows = await conn.fetch(
                    f"SELECT {cols} FROM finance_packages "
                    f"WHERE brand_name ILIKE $1 AND {model_cond} "
                    f"ORDER BY variant_name, dp_amount ASC LIMIT 8",
                    b_pattern, m_pattern, m_raw,
                )
    except Exception as e:
        log.warning(f"Failed to fetch finance_packages: {e}")
        return None
            
    if not rows:
        return None
        
    # Format baris jadi bullet points
    lines = ["[INFO PAKET KREDIT / SIMULASI CICILAN TERBARU YANG TERSEDIA DI DATABASE (Tawarkan Jika Relavan)]:"]
    for i, r in enumerate(rows, 1):
        v_name = r["variant_name"] if r["variant_name"] else ""
        c_name = f"({r['city_name']})" if r["city_name"] else ""
        pkg = f"[{r['package_name']}]" if r["package_name"] else ""
        
        # Formatting uang (misal: 150.000.000)
        otr = f"Rp {int(r['otr_price']):,}".replace(",", ".") if r["otr_price"] else "N/A"
        dp = f"Rp {int(r['dp_amount']):,}".replace(",", ".") if r["dp_amount"] else "N/A"
        emi = f"Rp {int(r['emi']):,}".replace(",", ".") if r["emi"] else "N/A"
        tenor = f"{r['tenor_months']} bln" if r["tenor_months"] else "N/A"
        
        line = f"  {i}. {pkg} {r['brand_name']} {r['model_name']} {v_name} {c_name} | OTR: {otr} | DP: {dp} | Tenor: {tenor} | Cicilan: {emi}/bulan"
        lines.append(line)
        
    lines.append("CATATAN UNTUK AI: Jika customer bertanya tentang DP/Cicilan/Harga, GUNAKAN angka dari atas. Jangan buat estimasi sendiri.")
    
    return "\n".join(lines)
