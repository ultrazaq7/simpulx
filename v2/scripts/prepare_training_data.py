#!/usr/bin/env python3
"""
prepare_training_data.py — turn a SmartKonek message export CSV into
training-ready datasets for the self-trained Simpulx sales agent.

The LLM itself is trained elsewhere; this only prepares clean data:

  1. train_conversations.jsonl  — one chat-style record per contact thread
       {"messages": [{"role": "system"|"user"|"assistant", "content": "..."}]}
     Incoming -> user (customer), Outgoing -> assistant (agent). Consecutive
     same-role turns are merged. Media-only turns become "[image]" etc.
  2. intent_examples.jsonl      — every inbound customer message with its
       lead source (CTWA ad id/url) for classifier / few-shot use.
  3. prints a summary + suggested intent keywords (top tokens in inbound msgs).

Pure stdlib (csv handles quoted newlines), no pip installs.

Usage:
  python prepare_training_data.py --csv messages_data_train.csv --out ./train_out
"""
import argparse
import csv
import json
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime

SYSTEM_PROMPT = (
    "You are a helpful WhatsApp sales agent for an Indonesian vehicle dealership. "
    "Reply concisely and politely in the customer's language (usually Bahasa Indonesia), "
    "answer product questions, and guide the customer toward a test drive or purchase."
)

# Indonesian + English stopwords to ignore when mining intent keywords.
STOP = set("""
yang untuk dari dengan dan atau ini itu saya kami kita anda bapak ibu mas mbak
pak bu ya yg ga gak nggak tidak bisa ada mau ingin tahu lebih banyak halo hai
the a an to for of is are i you we it this that and or with on in at please
ok oke iya tidak apakah kah nya ke di se sudah belum nanti aja saja juga kalau
""".split())

WORD = re.compile(r"[a-zA-ZÀ-ɏ]{3,}")


def parse_dt(s: str):
    s = (s or "").strip()
    for fmt in ("%m/%d/%Y %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%m/%d/%Y %H:%M"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def turn_text(row: dict) -> str:
    msg = (row.get("Message") or "").strip()
    if msg:
        return msg
    cap = (row.get("File Caption") or "").strip()
    if cap:
        return cap
    mtype = (row.get("Message Type") or "").strip().lower()
    if mtype and mtype != "text":
        return f"[{mtype}]"
    return ""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", required=True)
    ap.add_argument("--out", default="./train_out")
    ap.add_argument("--min-turns", type=int, default=2, help="skip threads shorter than this")
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    csv.field_size_limit(10_000_000)

    threads = defaultdict(list)  # contact_id -> [(dt, role, text)]
    total = incoming = outgoing = ad_leads = media = 0
    kw = Counter()
    intent_path = os.path.join(args.out, "intent_examples.jsonl")

    with open(args.csv, "r", encoding="utf-8", newline="") as f, \
         open(intent_path, "w", encoding="utf-8") as intent_f:
        reader = csv.DictReader(f)
        for row in reader:
            total += 1
            direction = (row.get("Direction") or "").strip().lower()
            text = turn_text(row)
            mtype = (row.get("Message Type") or "").strip().lower()
            if mtype and mtype != "text":
                media += 1
            cid = (row.get("Contact ID") or "").strip()
            dt = parse_dt(row.get("Created At", ""))
            if not text or not cid:
                continue
            role = "user" if direction == "incoming" else "assistant"
            threads[cid].append((dt or datetime.min, role, text))

            if role == "user":
                incoming += 1
                src_type = (row.get("Source Type") or "").strip()
                is_ad = src_type.lower() == "ad"
                if is_ad:
                    ad_leads += 1
                for w in WORD.findall(text.lower()):
                    if w not in STOP:
                        kw[w] += 1
                intent_f.write(json.dumps({
                    "text": text,
                    "from_ad": is_ad,
                    "source_type": src_type or None,
                    "source_id": (row.get("Source Id") or "").strip() or None,
                    "source_url": (row.get("Source Url") or "").strip() or None,
                }, ensure_ascii=False) + "\n")
            else:
                outgoing += 1

    # Build conversation JSONL (merge consecutive same-role turns).
    conv_path = os.path.join(args.out, "train_conversations.jsonl")
    kept = 0
    with open(conv_path, "w", encoding="utf-8") as out:
        for cid, turns in threads.items():
            turns.sort(key=lambda t: t[0])
            merged = []
            for _, role, text in turns:
                if merged and merged[-1]["role"] == role:
                    merged[-1]["content"] += "\n" + text
                else:
                    merged.append({"role": role, "content": text})
            if len(merged) < args.min_turns:
                continue
            messages = [{"role": "system", "content": SYSTEM_PROMPT}] + merged
            out.write(json.dumps({"messages": messages}, ensure_ascii=False) + "\n")
            kept += 1

    print("=" * 60)
    print(f"Rows read           : {total:,}")
    print(f"Inbound (customer)  : {incoming:,}")
    print(f"Outbound (agent)    : {outgoing:,}")
    print(f"Media messages      : {media:,}")
    print(f"CTWA ad leads       : {ad_leads:,}")
    print(f"Contact threads     : {len(threads):,}")
    print(f"Threads kept (>= {args.min_turns}) : {kept:,}")
    print(f"\nWrote: {conv_path}")
    print(f"Wrote: {intent_path}")
    print("\nTop 25 inbound keywords (candidate intent terms):")
    for word, n in kw.most_common(25):
        print(f"  {word:<18} {n:,}")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
