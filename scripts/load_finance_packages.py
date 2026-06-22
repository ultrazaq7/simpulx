import asyncio
import csv
import glob
import logging
import os
import sys
from datetime import datetime

# Tambahkan path root agar bisa import simpulx_common
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "libs", "python")))

from simpulx_common.db import get_pool

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("load_finance")

async def main():
    folder_path = "./data-train/finance_packages"
    csv_files = glob.glob(f"{folder_path}/*.csv")
    
    if not csv_files:
        log.error(f"Tidak ada file CSV ditemukan di {folder_path}")
        return

    pool = await get_pool()
    
    async with pool.acquire() as conn:
        log.info("Membuat tabel finance_packages (jika belum ada)...")
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS finance_packages (
                id SERIAL PRIMARY KEY,
                category_type VARCHAR(50),
                brand_name VARCHAR(100),
                model_name VARCHAR(100),
                variant_name VARCHAR(100),
                city_name VARCHAR(100),
                otr_price NUMERIC,
                dp_amount NUMERIC,
                tenor_months INT,
                emi NUMERIC,
                installment_type VARCHAR(50),
                insurance_type VARCHAR(50),
                package_name VARCHAR(255),
                created_date DATE
            );
        """)
        
        # Kosongkan tabel sebelum diisi ulang dengan data terbaru
        log.info("Mengosongkan tabel finance_packages...")
        await conn.execute("TRUNCATE TABLE finance_packages;")
        
        total_inserted = 0
        
        for csv_file in csv_files:
            log.info(f"Membaca file {csv_file}...")
            
            # Kita kumpulkan data dalam memory, lalu copy ke Postgres untuk kecepatan ekstrim
            records = []
            
            with open(csv_file, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    records.append((
                        row.get("category_type"),
                        row.get("brand_name"),
                        row.get("model_name"),
                        row.get("variant_name"),
                        row.get("city_name"),
                        float(row.get("otr_price", 0)) if row.get("otr_price") else None,
                        float(row.get("dp_amount", 0)) if row.get("dp_amount") else None,
                        int(row.get("tenor_months", 0)) if row.get("tenor_months") else None,
                        float(row.get("emi", 0)) if row.get("emi") else None,
                        row.get("installment_type"),
                        row.get("insurance_type"),
                        row.get("package_name"),
                        # Parse string YYYY-MM-DD ke datetime.date
                        datetime.strptime(row.get("created_date"), "%Y-%m-%d").date() if row.get("created_date") else None
                    ))
            
            if records:
                log.info(f"Memasukkan {len(records)} baris ke database...")
                await conn.copy_records_to_table(
                    "finance_packages",
                    columns=[
                        "category_type", "brand_name", "model_name", "variant_name", "city_name",
                        "otr_price", "dp_amount", "tenor_months", "emi", "installment_type", 
                        "insurance_type", "package_name", "created_date"
                    ],
                    records=records
                )
                total_inserted += len(records)
                
        # Buat index untuk mempercepat pencarian (RAG)
        log.info("Membuat index untuk kolom pencarian...")
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_finance_brand ON finance_packages(brand_name);
            CREATE INDEX IF NOT EXISTS idx_finance_model ON finance_packages(model_name);
            CREATE INDEX IF NOT EXISTS idx_finance_city ON finance_packages(city_name);
        """)
        
    log.info(f"Selesai! Total {total_inserted} paket kredit berhasil disimpan ke database.")

if __name__ == "__main__":
    asyncio.run(main())
