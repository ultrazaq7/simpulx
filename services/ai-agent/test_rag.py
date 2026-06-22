import asyncio
import sys
import os

# Set root path to import simpulx_common
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "libs", "python")))

from simpulx_common.db import get_pool
from finance_rag import get_finance_context

async def main():
    pool = await get_pool()
    
    brand = "Mitsubishi"
    model = "Xpander"
    city = "Bogor"
    
    print(f"\n[🔍] MENCARI PAKET KREDIT UNTUK: {brand} {model} ({city})\n")
    ctx = await get_finance_context(pool, brand, model, city)
    
    if ctx:
        print("✅ HASIL DITEMUKAN:")
        print("=========================================================")
        print(ctx)
        print("=========================================================")
    else:
        print("❌ TIDAK ADA HASIL")
        
    print("\n[🔍] MENCARI PAKET KREDIT UNTUK: JAECOO J8 ARDIS (Semua Kota/Default)\n")
    ctx2 = await get_finance_context(pool, "JAECOO", "J8 ARDIS", None)
    
    if ctx2:
        print("✅ HASIL DITEMUKAN:")
        print("=========================================================")
        print(ctx2)
        print("=========================================================")
    else:
        print("❌ TIDAK ADA HASIL")

if __name__ == "__main__":
    asyncio.run(main())
