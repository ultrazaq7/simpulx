import json, os, sys, glob, csv
from collections import defaultdict
from datetime import datetime
import re

INTENT_KW = re.compile(r"\b(harga|otr|dp|tdp|angsuran|cicilan|kredit|tenor|bunga|leasing|promo|diskon|cashback|subsidi|test drive|spk|indent|showroom|lokasi|alamat|ktp|kk|berkas|proses)\b", re.I)
OFF_TOPIC = re.compile(r"\b(loker|lowongan|kerja|lamar|driver|supir|sopir|bengkel|servis|service)\b", re.I)

def parse_dt(s):
    s = (s or "").strip()
    for fmt in ("%m/%d/%Y %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%m/%d/%Y %H:%M"):
        try: return datetime.strptime(s, fmt)
        except ValueError: continue
    return None

def build_threads(csv_paths):
    csv.field_size_limit(10_000_000)
    raw = defaultdict(list)
    for path in csv_paths:
        with open(path, "r", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                cid = (row.get("Contact ID") or "").strip()
                msg = (row.get("Message") or "").strip() or (row.get("File Caption") or "").strip()
                if not cid or not msg: continue
                role = "Customer" if (row.get("Direction") or "").strip().lower() == "incoming" else "Agent"
                raw[cid].append((parse_dt(row.get("Created At", "")) or datetime.min, role, msg))
    threads = {}
    for cid, turns in raw.items():
        turns.sort(key=lambda t: t[0])
        merged = []
        for _, role, text in turns:
            if merged and merged[-1][0] == role: merged[-1][1] += "\n" + text
            else: merged.append([role, text])
        if len(merged) >= 2: threads[cid] = merged
    return threads

def main():
    paths = sorted(glob.glob("/workspace/data-train/*.csv"))
    # Only up to file 13
    paths = [p for p in paths if not p.endswith("14.csv")]
    print(f"Reading from {len(paths)} CSV files...")
    
    threads = build_threads(paths)
    
    out = "/workspace/data/train_out"
    os.makedirs(out, exist_ok=True)
    out_path = os.path.join(out, "labeled.jsonl")
    
    pos = 0
    with open(out_path, "w", encoding="utf-8") as f:
        for cid, merged in threads.items():
            cust_text = "\n".join(text for role, text in merged if role == "Customer")
            off_topic = bool(OFF_TOPIC.search(cust_text))
            strong_intent = bool(INTENT_KW.search(cust_text))
            
            serious = 1 if (strong_intent and not off_topic and len(merged) >= 3) else 0
            pos += serious
            rec = {
                "contact_id": cid,
                "serious_buyer": serious,
                "interest": "warm" if serious else "cold",
                "off_topic": off_topic,
                "confidence": 0.8,
                "reason": "Heuristic labeling by AI Agent",
                "n_turns": len(merged)
            }
            f.write(json.dumps(rec) + "\n")
            
    print(f"Heuristically labeled {len(threads)} threads. Positives: {pos} ({(pos/len(threads))*100:.1f}%)")

if __name__ == "__main__":
    main()
