#!/usr/bin/env python3
"""label_conversations.py - LLM proxy labels for the Lead Health Score bootstrap.

The SmartKonek export (v2/data-train/*.csv) has conversations but NO win/loss
outcome, so we cannot train supervised XGBoost directly. This script distills a
*proxy* label by asking Claude Haiku to read each full conversation and judge
whether the customer was a serious buyer. The label is noisy (it mimics the
LLM's judgment, not real sales) - the model trained on it is a "Lead Health
Score", not a sales-outcome prediction. Replace with real disposition labels
once production has them (see plan Phase 3).

Phases:
  --analyze (default): build per-contact threads from the CSVs, print stats. FREE.
  --label            : send each thread to Claude -> labeled.jsonl. Needs
                       ANTHROPIC_API_KEY. Use --limit to cost-control first.

Pure stdlib + httpx (same as distill_kb.py). Run in the ai-agent container or
any python with httpx + ANTHROPIC_API_KEY set.

Usage:
  python label_conversations.py --csv ../data-train --out ./train_out
  python label_conversations.py --csv ../data-train --out ./train_out --label --limit 200
"""
from __future__ import annotations

import argparse
import csv
import glob
import json
import os
import random
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

MIN_TURNS = 2  # skip threads too short to judge

LABEL_SYS = (
    "You label historical Indonesian WhatsApp car-sales conversations for lead quality. "
    "Input is ONE full conversation between a Customer and a dealer Agent. "
    "Judge, from the CUSTOMER's messages only, whether this was a serious buyer.\n"
    "Output ONLY a JSON object, no prose:\n"
    '{"serious_buyer": 0 or 1, "interest": "hot"|"warm"|"cold", '
    '"off_topic": true|false, "confidence": 0.0-1.0, "reason": "<short English>"}\n'
    "serious_buyer=1 if the customer showed genuine purchase intent: asked price/DP/credit "
    "seriously, requested a test drive, booked/SPK/indent, arranged a showroom visit, or "
    "negotiated toward closing. serious_buyer=0 for idle questions, one-word replies, "
    "ghosting, or off-topic. off_topic=true for job-seekers / driver-recruitment / non-buyers. "
    "interest: hot=ready to buy soon, warm=comparing price/specs, cold=light curiosity. "
    "confidence = your certainty 0.0-1.0."
)


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


def build_threads(csv_paths):
    """contact_id -> merged [(role, text)] transcript, ordered by time."""
    csv.field_size_limit(10_000_000)
    raw = defaultdict(list)  # cid -> [(dt, role, text)]
    for path in csv_paths:
        with open(path, "r", encoding="utf-8", newline="") as f:
            for row in csv.DictReader(f):
                cid = (row.get("Contact ID") or "").strip()
                text = turn_text(row)
                if not cid or not text:
                    continue
                direction = (row.get("Direction") or "").strip().lower()
                role = "Customer" if direction == "incoming" else "Agent"
                raw[cid].append((parse_dt(row.get("Created At", "")) or datetime.min, role, text))

    threads = {}
    for cid, turns in raw.items():
        turns.sort(key=lambda t: t[0])
        merged = []
        for _, role, text in turns:
            if merged and merged[-1][0] == role:
                merged[-1][1] += "\n" + text
            else:
                merged.append([role, text])
        if len(merged) >= MIN_TURNS:
            threads[cid] = merged
    return threads


def transcript(merged) -> str:
    return "\n".join(f"{role}: {text}" for role, text in merged)


def _label_one(api_key, model, cid, merged):
    import httpx

    convo = transcript(merged)
    if len(convo) > 8000:
        convo = convo[:8000]
    try:
        resp = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": api_key, "anthropic-version": "2023-06-01",
                     "content-type": "application/json"},
            json={"model": model, "max_tokens": 300,
                  "system": [{"type": "text", "text": LABEL_SYS,
                              "cache_control": {"type": "ephemeral"}}],
                  "messages": [{"role": "user", "content": "Conversation:\n" + convo}]},
            timeout=120,
        )
        resp.raise_for_status()
        data = resp.json()
        u = data.get("usage", {})
        txt = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
        obj = json.loads(txt[txt.index("{"): txt.rindex("}") + 1])
        rec = {
            "contact_id": cid,
            "serious_buyer": int(obj.get("serious_buyer", 0)),
            "interest": obj.get("interest"),
            "off_topic": bool(obj.get("off_topic", False)),
            "confidence": float(obj.get("confidence", 0.0)),
            "reason": (obj.get("reason") or "").strip(),
            "n_turns": len(merged),
        }
        return rec, u.get("input_tokens", 0), u.get("output_tokens", 0), None
    except Exception as e:  # noqa: BLE001
        return None, 0, 0, f"{type(e).__name__}: {str(e)[:120]}"


def analyze(threads, out) -> int:
    os.makedirs(out, exist_ok=True)
    lens = sorted(len(m) for m in threads.values())
    print("=" * 60)
    print(f"Contact threads (>= {MIN_TURNS} turns) : {len(threads):,}")
    if lens:
        print(f"Turns/thread  min/median/max : {lens[0]} / {lens[len(lens)//2]} / {lens[-1]}")
    print("\nSample transcripts:")
    for cid, merged in list(threads.items())[:3]:
        print(f"\n--- {cid} ({len(merged)} turns) ---")
        print(transcript(merged)[:400])
    print("=" * 60)
    return 0


def dump(threads, out, n, seed) -> int:
    """Write a random sample of transcripts for MANUAL labeling (no API). The
    operator (or the agent) reads threads_dump.jsonl and writes labeled.jsonl
    with the same schema label() would produce."""
    os.makedirs(out, exist_ok=True)
    items = [(cid, m) for cid, m in threads.items() if len(m) >= 3]  # judgeable
    random.Random(seed).shuffle(items)
    items = items[:n] if n > 0 else items
    path = os.path.join(out, "threads_dump.jsonl")
    with open(path, "w", encoding="utf-8") as fo:
        for cid, merged in items:
            t = transcript(merged)
            if len(t) > 900:
                t = t[:900]
            fo.write(json.dumps({"contact_id": cid, "n_turns": len(merged),
                                 "transcript": t}, ensure_ascii=False) + "\n")
    print(f"dumped {len(items):,} transcripts -> {path}")
    return 0


def label(threads, out, model, limit, workers) -> int:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        print("ANTHROPIC_API_KEY not set"); return 1
    os.makedirs(out, exist_ok=True)
    items = list(threads.items())
    if limit > 0:
        items = items[:limit]
    print(f"labeling {len(items):,} threads with {model} (workers={workers})")

    path = os.path.join(out, "labeled.jsonl")
    in_tok = out_tok = ok = failed = 0
    pos = 0
    with open(path, "w", encoding="utf-8") as fo, ThreadPoolExecutor(max_workers=workers) as ex:
        futs = [ex.submit(_label_one, api_key, model, cid, merged) for cid, merged in items]
        for i, fut in enumerate(futs):
            rec, it, ot, err = fut.result()
            in_tok += it; out_tok += ot
            if err:
                failed += 1
            else:
                fo.write(json.dumps(rec, ensure_ascii=False) + "\n")
                ok += 1
                pos += rec["serious_buyer"]
            if (i + 1) % 20 == 0:
                print(f"  {i+1}/{len(items)} done, {pos} serious_buyer=1", end="\r")

    cost = in_tok / 1e6 * 1.0 + out_tok / 1e6 * 5.0  # ~Haiku 4.5 $/Mtok
    print(f"\n{'='*60}")
    print(f"labeled ok {ok:,} | failed {failed} | serious_buyer=1 {pos:,} ({pos/max(ok,1)*100:.1f}%)")
    print(f"tokens in={in_tok:,} out={out_tok:,} | est cost ~${cost:.2f}")
    print(f"wrote {path}\n{'='*60}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", required=True, help="data-train dir or a single CSV")
    ap.add_argument("--out", default="./train_out")
    ap.add_argument("--label", action="store_true", help="Phase 2: label via Claude")
    ap.add_argument("--dump", type=int, default=0, help="write N random transcripts for manual labeling (no API)")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--model", default="claude-haiku-4-5-20251001")
    ap.add_argument("--limit", type=int, default=0, help="0 = all; >0 = first N threads (cost control)")
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()

    paths = ([args.csv] if args.csv.lower().endswith(".csv")
             else sorted(glob.glob(os.path.join(args.csv, "*.csv"))))
    if not paths:
        ap.error(f"no CSV found at {args.csv}")
    threads = build_threads(paths)
    if not threads:
        print("no usable threads"); return 1

    if args.dump:
        return dump(threads, args.out, args.dump, args.seed)
    if args.label:
        return label(threads, args.out, args.model, args.limit, args.workers)
    return analyze(threads, args.out)


if __name__ == "__main__":
    raise SystemExit(main())
