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
        
    # Buat ILIKE query (case insensitive)
    b_pattern = f"%{brand.strip()}%" if brand else "%"
    m_pattern = f"%{model.strip()}%" if model else "%"
    
    async with pool.acquire() as conn:
        if city:
            c_pattern = f"%{city.strip()}%"
            rows = await conn.fetch(
                """SELECT brand_name, model_name, variant_name, city_name, otr_price, dp_amount, tenor_months, emi, package_name
                   FROM finance_packages
                   WHERE brand_name ILIKE $1 AND model_name ILIKE $2 AND city_name ILIKE $3
                   ORDER BY dp_amount ASC
                   LIMIT 5""",
                b_pattern, m_pattern, c_pattern
            )
            # Fallback jika di kota spesifik tidak ada
            if not rows:
                rows = await conn.fetch(
                    """SELECT brand_name, model_name, variant_name, city_name, otr_price, dp_amount, tenor_months, emi, package_name
                       FROM finance_packages
                       WHERE brand_name ILIKE $1 AND model_name ILIKE $2
                       ORDER BY dp_amount ASC
                       LIMIT 5""",
                    b_pattern, m_pattern
                )
        else:
            rows = await conn.fetch(
                """SELECT brand_name, model_name, variant_name, city_name, otr_price, dp_amount, tenor_months, emi, package_name
                   FROM finance_packages
                   WHERE brand_name ILIKE $1 AND model_name ILIKE $2
                   ORDER BY dp_amount ASC
                   LIMIT 5""",
                b_pattern, m_pattern
            )
            
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
