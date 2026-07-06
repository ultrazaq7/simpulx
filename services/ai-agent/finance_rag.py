"""Retrieval Khusus untuk Simulasi Kredit (Finance Packages)."""
from __future__ import annotations

import logging

log = logging.getLogger("finance-rag")


async def get_catalog_context(pool, campaign_id, brand: str, model: str,
                              city: str = None, segment: str = None) -> str | None:
    """Segment-generic, CAMPAIGN-SCOPED catalog lookup (WS-A).

    Tries the per-campaign campaign_catalog first so one campaign never grounds
    on another's pricing (fixes the global finance_packages cross-dealer leak).
    If the campaign has no catalog rows -- or anything goes wrong -- it FALLS BACK
    to the legacy global finance_packages lookup, so the live bot never loses its
    grounding. Safe to swap in for get_finance_context at any call site that has
    the conversation's campaign_id in scope.
    """
    if campaign_id:
        try:
            ctx = await _catalog_from_table(pool, campaign_id, brand, model, city)
            if ctx:
                return ctx
        except Exception as e:  # never let the new path break grounding
            log.warning(f"campaign_catalog lookup failed, falling back: {e}")
    # Fallback: legacy global finance_packages (automotive only).
    return await get_finance_context(pool, brand, model, city)


async def _catalog_from_table(pool, campaign_id, brand: str, model: str,
                              city: str = None) -> str | None:
    """Query campaign_catalog for one campaign, matching item/variant on the
    lead's brand/model. Formats rows segment-agnostically (spine columns +
    whatever segment-specific keys sit in the attributes jsonb)."""
    needle = (model or brand or "").strip()
    if not needle:
        return None
    like = f"%{needle}%"
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT item_name, variant_name, location_name, category_type,
                      headline_price, attributes
                 FROM campaign_catalog
                WHERE campaign_id = $1::uuid
                  AND (item_name ILIKE $2 OR variant_name ILIKE $2
                       OR $2 ILIKE '%' || item_name || '%')
                ORDER BY variant_name NULLS LAST, headline_price ASC NULLS LAST
                LIMIT 8""",
            campaign_id, like,
        )
    if not rows:
        return None
    # If a city was given and some rows match it, prefer those (else keep all).
    if city:
        cl = city.strip().lower()
        pref = [r for r in rows if r["location_name"] and cl in r["location_name"].lower()]
        if pref:
            rows = pref

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
            parts.append(f"| Harga: {price}")
        # Surface segment-specific fields from attributes (dp, tenor, emi, size, ...).
        attrs = r["attributes"] or {}
        if isinstance(attrs, dict):
            for k, v in attrs.items():
                if v in (None, ""):
                    continue
                money = rupiah(v) if k in ("dp", "dp_amount", "emi", "plafon", "otr_price", "price") else None
                parts.append(f"| {k}: {money or v}")
        lines.append("  " + f"{i}. " + " ".join(str(p) for p in parts if p))
    lines.append("CATATAN UNTUK AI: Jika customer bertanya tentang harga/DP/cicilan, GUNAKAN angka dari atas. Jangan buat estimasi sendiri.")
    return "\n".join(lines)

async def get_finance_context(pool, brand: str, model: str, city: str = None) -> str | None:
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
        async with pool.acquire() as conn:
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
