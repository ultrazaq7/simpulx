#!/usr/bin/env python3
"""seed_from_smartkonek.py — import a sample of the SmartKonek export CSV into
the Simpulx v2 dev database for a realistic demo: contacts, conversations,
messages, campaign attribution (ad/keyword), agent round-robin, and a basic
interest/stage heuristic so the dashboard + analytics are populated.

The CTWA ad opener (Source Type = ad, first inbound) is stored with genuine=false
so the lead classifier ignores it (matches the runtime behavior).

Requires psycopg (v3). Usage:
  DATABASE_URL=postgres://simpulx:simpulx@localhost:5432/simpulx_v2 \
  python seed_from_smartkonek.py --csv messages_data_train.csv --limit 150
"""
import argparse
import csv
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone

import psycopg

ORG = "00000000-0000-0000-0000-0000000000a1"
AGENTS = ["00000000-0000-0000-0000-0000000000e1", "00000000-0000-0000-0000-0000000000e2"]
CAMPAIGN = "00000000-0000-0000-0000-0000000000f1"
STRONG = ("deal", "test drive", "booking", "spk", "ambil unit", "transfer", "bayar", "siap order")
WARM = ("harga", "berapa", "brp", "kredit", "cicilan", "dp", "promo", "tertarik", "minat",
        "brio", "creta", "bajaj", "toyota", "honda", "hyundai", "suzuki", "xpeng")


def parse_dt(s):
    s = (s or "").strip()
    for f in ("%m/%d/%Y %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%m/%d/%Y %H:%M"):
        try:
            return datetime.strptime(s, f).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def text_of(row):
    return ((row.get("Message") or "").strip()
            or (row.get("File Caption") or "").strip()
            or "[%s]" % (row.get("Message Type") or "media").lower())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", required=True)
    ap.add_argument("--limit", type=int, default=150)
    args = ap.parse_args()
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        print("set DATABASE_URL"); return 1
    csv.field_size_limit(10_000_000)

    threads = defaultdict(list)
    meta = {}
    with open(args.csv, encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            cid = (row.get("Contact ID") or "").strip()
            phone = (row.get("Contact Phone Number") or "").strip()
            if not cid or not phone:
                continue
            threads[cid].append(row)
            meta.setdefault(cid, (row.get("Contact Name") or "", phone))
    ids = list(threads.keys())[: args.limit]

    contacts = convs = msgs = 0
    fallback = datetime.now(timezone.utc)
    with psycopg.connect(dsn, autocommit=True) as conn, conn.cursor() as cur:
        for i, cid in enumerate(ids):
            rows = sorted(threads[cid], key=lambda r: parse_dt(r.get("Created At", "")) or datetime.min.replace(tzinfo=timezone.utc))
            name, phone = meta[cid]

            cur.execute(
                """INSERT INTO contacts (organization_id, phone, full_name, source_channel)
                   VALUES (%s,%s,NULLIF(%s,''),'whatsapp')
                   ON CONFLICT (organization_id, phone)
                   DO UPDATE SET full_name = COALESCE(NULLIF(EXCLUDED.full_name,''), contacts.full_name)
                   RETURNING id""", (ORG, phone, name))
            contact_id = cur.fetchone()[0]
            contacts += 1

            inc = [r for r in rows if (r.get("Direction") or "").lower() == "incoming"]
            is_ad = any((r.get("Source Type") or "").lower() == "ad" for r in rows)
            blob = " ".join(text_of(r).lower() for r in inc)
            campaign = CAMPAIGN if (is_ad or "brio" in blob or "honda" in blob) else None
            agent = AGENTS[i % len(AGENTS)]

            genuine_blob = " ".join(text_of(r).lower() for r in inc if (r.get("Source Type") or "").lower() != "ad")
            if any(k in genuine_blob for k in STRONG):
                interest, stage = "hot", "high_intent"
            elif any(k in genuine_blob for k in WARM):
                interest, stage = "warm", "considering"
            elif genuine_blob:
                interest, stage = "cold", "engaged"
            else:
                interest, stage = None, "new"

            last_dt = parse_dt(rows[-1].get("Created At", "")) or fallback
            cur.execute("SELECT id FROM stages WHERE organization_id=%s AND system_key=%s", (ORG, stage))
            srow = cur.fetchone()
            stage_id = srow[0] if srow else None

            cur.execute(
                """INSERT INTO conversations
                     (organization_id, contact_id, channel, status, is_bot_active, assigned_agent_id,
                      campaign_id, interest_level, ai_stage, stage_id, last_message_at, created_at)
                   VALUES (%s,%s,'whatsapp','open',false,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                (ORG, contact_id, agent, campaign, interest, stage, stage_id, last_dt, last_dt))
            conv_id = cur.fetchone()[0]
            convs += 1

            first_ad = False
            last_in = last_out = None
            preview = ""
            for r in rows:
                inbound = (r.get("Direction") or "").lower() == "incoming"
                direction = "inbound" if inbound else "outbound"
                sender = "contact" if inbound else "agent"
                body = text_of(r)
                created = parse_dt(r.get("Created At", "")) or last_dt
                mtype = (r.get("Message Type") or "text").lower()
                if mtype not in ("text", "image", "audio", "video", "document"):
                    mtype = "text"
                media = (r.get("File Url") or "").strip()
                genuine = True
                if inbound and (r.get("Source Type") or "").lower() == "ad" and not first_ad:
                    genuine, first_ad = False, True
                cur.execute(
                    """INSERT INTO messages
                         (organization_id, conversation_id, direction, sender_type, type, body, media_url, status, genuine, created_at)
                       VALUES (%s,%s,%s,%s,%s,%s,NULLIF(%s,''),'delivered',%s,%s)""",
                    (ORG, conv_id, direction, sender, mtype, body, media, genuine, created))
                msgs += 1
                preview = body[:200]
                if inbound:
                    last_in = created
                else:
                    last_out = created
            cur.execute(
                """UPDATE conversations SET last_message_preview=%s, last_contact_message_at=%s,
                          last_agent_message_at=%s WHERE id=%s""",
                (preview, last_in, last_out, conv_id))

    print(f"Imported: contacts={contacts}, conversations={convs}, messages={msgs}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
