import asyncio
import logging
import sys

from simpulx_common.db import get_pool
from orchestrator import classify_and_update
import lead_score

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("reclassify")

async def main():
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT id, organization_id FROM conversations WHERE classification_locked = false")
    
    log.info(f"Found {len(rows)} unlocked conversations to reclassify.")
    
    updated = 0
    for r in rows:
        conv_id = r["id"]
        org_id = r["organization_id"]
        try:
            # 1. Rules classifier
            cr = await classify_and_update(pool, org_id, conv_id, log)
            if cr and cr.get("changed"):
                updated += 1
            # 2. CatBoost Lead Score
            await lead_score.score_and_update(pool, conv_id, log)
        except Exception as e:
            log.error(f"Error on {conv_id}: {e}")
            
    log.info(f"Done. {updated} conversations changed status.")

if __name__ == "__main__":
    asyncio.run(main())
