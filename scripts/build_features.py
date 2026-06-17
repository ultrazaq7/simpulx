#!/usr/bin/env python3
"""build_features.py - behavioral feature rows for the Lead Health Score.

Parses the SmartKonek export (v2/data-train/*.csv) into per-contact threads and
runs the SHARED feature extractor (services/ai-agent/features.py - the same code
used at serve time) so training and serving can never drift. Writes one JSON row
per contact: {contact_id, <feature columns...>}.

Features are purely behavioral + intent-keyword. The LLM proxy label lives in a
separate file (label_conversations.py) and is joined in train_lead_score.py -
the label is deliberately NOT a feature (anti-circularity).

Pure stdlib; imports `features`/`classifier` from the ai-agent service dir.

Usage:
  python build_features.py --csv ../data-train --out ./train_out
"""
from __future__ import annotations

import argparse
import csv
import glob
import json
import os
import sys
from collections import defaultdict
from datetime import datetime

# Make the shared feature extractor importable (single source of truth).
_SVC = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "services", "ai-agent"))
if _SVC not in sys.path:
    sys.path.insert(0, _SVC)

import features  # noqa: E402  (after sys.path tweak)


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
    return ""


def to_float(s) -> float:
    try:
        return float(str(s).strip())
    except (TypeError, ValueError):
        return 0.0


def build(csv_paths):
    """contact_id -> (turns, meta) for features.compute_features."""
    csv.field_size_limit(10_000_000)
    turns = defaultdict(list)          # cid -> [(dt, turn_dict)]
    n_calls = defaultdict(int)
    call_secs = defaultdict(float)
    connected = defaultdict(bool)
    ad_clicks = defaultdict(int)

    for path in csv_paths:
        with open(path, "r", encoding="utf-8", newline="") as f:
            for row in csv.DictReader(f):
                cid = (row.get("Contact ID") or "").strip()
                if not cid:
                    continue
                dt = parse_dt(row.get("Created At", ""))

                # Call rows (may carry no message text).
                if (row.get("Call ID") or "").strip():
                    n_calls[cid] += 1
                    secs = to_float(row.get("Call Duration (in sec)"))
                    call_secs[cid] += secs
                    cs = (row.get("Connect Status") or "").strip().lower()
                    if secs > 0 or "connect" in cs or "answer" in cs:
                        connected[cid] = True

                if (row.get("Source Type") or "").strip().lower() == "ad":
                    ad_clicks[cid] += 1

                text = turn_text(row)
                if not text:
                    continue
                direction = (row.get("Direction") or "").strip().lower()
                turns[cid].append((dt or datetime.min, {
                    "direction": "inbound" if direction == "incoming" else "outbound",
                    "text": text,
                    "ts": dt,
                    "mtype": (row.get("Message Type") or "text").strip().lower() or "text",
                }))

    out = {}
    for cid, tl in turns.items():
        tl.sort(key=lambda t: t[0])
        ordered = [t[1] for t in tl]
        meta = {
            "n_calls": n_calls[cid],
            "total_call_duration_sec": call_secs[cid],
            "any_call_connected": connected[cid],
            "from_ad": ad_clicks[cid] > 0,
            "ad_clicks": ad_clicks[cid],
        }
        # Train-side entity extraction: scan the customer's messages with the
        # SAME gazetteer the serving path normalizes the LLM fields with.
        inbound_blob = "\n".join(t["text"] for t in ordered if t["direction"] == "inbound")
        entities = features.scan_entities(inbound_blob)
        out[cid] = (ordered, meta, entities)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", required=True, help="data-train dir or a single CSV")
    ap.add_argument("--out", default="./train_out")
    args = ap.parse_args()

    paths = ([args.csv] if args.csv.lower().endswith(".csv")
             else sorted(glob.glob(os.path.join(args.csv, "*.csv"))))
    if not paths:
        ap.error(f"no CSV found at {args.csv}")

    os.makedirs(args.out, exist_ok=True)
    threads = build(paths)
    path = os.path.join(args.out, "features.jsonl")
    with open(path, "w", encoding="utf-8") as fo:
        for cid, (ordered, meta, entities) in threads.items():
            feats = features.compute_features(ordered, meta, entities)
            fo.write(json.dumps({"contact_id": cid, **feats}) + "\n")

    print("=" * 60)
    print(f"contacts with features : {len(threads):,}")
    print(f"feature columns        : {len(features.FEATURE_ORDER)}")
    print(f"wrote {path}")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
