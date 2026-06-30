"""Retrieval Khusus untuk Simulasi Kredit (Finance Packages)."""
from __future__ import annotations

import logging

log = logging.getLogger("finance-rag")

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
