#!/usr/bin/env python3
"""distill_kb.py - turn SmartKonek all-time chat export into knowledge-base facts.

Pipeline (phased so we can stop & review):
  Phase 1 (--analyze, default): read CSVs, isolate AGENT (Outgoing) replies, drop
    filler ("halo", "iya pak"), keep fact-bearing replies (price/spec/promo signal),
    dedupe, and write candidates for review. FREE - no API, no DB.
  Phase 2 (--distill): send deduped candidates to Claude -> clean FAQ/fact list.
  Phase 3 (--ingest): POST the approved facts to the knowledge service.

This script never writes chat/conversations - the export is mined for facts only.

Usage:
  python distill_kb.py --src "C:/Users/Fachmi Razaq/Documents/Smartkonek Messages Data" --out ./data
"""
from __future__ import annotations

import argparse
import csv
import glob
import json
import os
import re
from collections import Counter

# Fact signal: a sales reply worth mining usually quotes numbers + a domain term.
FACT_KW = re.compile(
    r"\b(harga|otr|dp|tdp|angsuran|cicilan|kredit|tenor|bunga|leasing|promo|diskon|"
    r"cashback|subsidi|varian|tipe|spek|warna|transmisi|matic|manual|cvt|ready|stok|"
    r"unit|alamat|lokasi|showroom|brosur|katalog|bonus|gratis|juta|jt|rb|ribu)\b",
    re.I,
)
HAS_NUM = re.compile(r"\d")
# Filler / non-informative agent turns to drop outright.
FILLER = re.compile(
    r"^(ya|iya|oke?|ok|baik|siap|halo+|hai|hi|pagi|siang|sore|malam|terima kasih|"
    r"makasih|thanks?|sama2|sama-sama|mantap|noted|pak|bu|kak|ditunggu|monggo|"
    r"silahkan|silakan|👍+|🙏+|😊+|\W*)$",
    re.I,
)

CSV_GLOB = "message-history-*.csv"

# Ad / broadcast noise: CTWA "*POST VIEWED*" openers, dead fb.me links, etc.
# These are automated marketing posts, not genuine sales answers - strip & drop.
MARKER_RE = re.compile(r"\*[^*\n]+\*")              # *POST VIEWED*, *PROMO*, ...
URL_RE = re.compile(r"(https?://\S+|fb\.me/\S+|wa\.me/\S+|www\.\S+)", re.I)
AD_MARKER = re.compile(r"post\s+viewed", re.I)


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip().lower())


def clean(text: str) -> str:
    """Strip ad markers + URLs so dedup collapses near-identical broadcasts."""
    t = MARKER_RE.sub(" ", text)
    t = URL_RE.sub(" ", t)
    return re.sub(r"\s+", " ", t).strip()


def is_fact(text: str) -> bool:
    if AD_MARKER.search(text):        # automated ad post, not a reply
        return False
    ct = clean(text)
    if len(ct) < 12:
        return False
    if FILLER.match(ct):
        return False
    return bool(FACT_KW.search(ct)) and bool(HAS_NUM.search(ct))


def analyze(src: str, out: str) -> int:
    files = sorted(glob.glob(os.path.join(src, CSV_GLOB)))
    if not files:
        print(f"no CSVs matching {CSV_GLOB} in {src}")
        return 1
    csv.field_size_limit(10_000_000)

    total = inc = out_agent = bot = 0
    agent_replies = []  # (contact_id, created, agent, text)
    for path in files:
        with open(path, encoding="utf-8", newline="") as f:
            for row in csv.DictReader(f):
                total += 1
                direction = (row.get("Direction") or "").strip().lower()
                msg = (row.get("Message") or "").strip() or (row.get("File Caption") or "").strip()
                if not msg:
                    continue
                if direction == "incoming":
                    inc += 1
                elif direction == "outgoing":
                    out_agent += 1
                    agent_replies.append((
                        (row.get("Contact ID") or "").strip(),
                        (row.get("Created At") or "").strip(),
                        (row.get("Sender/Agent Name") or "").strip(),
                        msg,
                    ))

    # Keep only fact-bearing agent replies, deduped by normalized text.
    seen: set[str] = set()
    facts = []
    dropped_filler = 0
    for cid, created, agent, text in agent_replies:
        if not is_fact(text):
            dropped_filler += 1
            continue
        ct = clean(text)
        key = norm(ct)
        if key in seen:
            continue
        seen.add(key)
        facts.append({"contact_id": cid, "created": created, "agent": agent, "text": ct})

    os.makedirs(out, exist_ok=True)
    cand_path = os.path.join(out, "agent_facts_candidates.jsonl")
    with open(cand_path, "w", encoding="utf-8") as fo:
        for rec in facts:
            fo.write(json.dumps(rec, ensure_ascii=False) + "\n")

    # Who answers most (sanity check that agent attribution works).
    top_agents = Counter(r["agent"] or "(blank)" for r in facts).most_common(8)

    print("=" * 64)
    print(f"CSV files                 : {len(files)}")
    print(f"Total rows                : {total:,}")
    print(f"Inbound (customer)        : {inc:,}")
    print(f"Outbound (agent) w/ text  : {out_agent:,}")
    print(f"  dropped as filler/short : {dropped_filler:,}")
    print(f"  fact-bearing (deduped)  : {len(facts):,}")
    print(f"\nWrote candidates -> {cand_path}")
    print("\nTop answering agents (fact replies):")
    for name, n in top_agents:
        print(f"  {name[:32]:<32} {n:,}")
    print("\nSample fact-bearing replies:")
    for rec in facts[:12]:
        t = rec["text"].replace("\n", " ")
        print(f"  [{rec['agent'][:14]:<14}] {t[:90]}")
    print("=" * 64)
    return 0


DISTILL_SYS = (
    "You extract structured product knowledge from raw Indonesian WhatsApp car-sales "
    "replies. Input is a numbered list of sales-agent messages, each prefixed with the "
    "dealer/agent name in brackets.\n"
    "Output ONLY a JSON array, no prose. Each element is one DISTINCT fact:\n"
    '{"dealer": str, "brand": str, "model": str, '
    '"category": "price"|"promo"|"spec"|"stock"|"process"|"location"|"trade_in"|"other", '
    '"fact": str, "needs_verification": bool}\n'
    "Rules: dealer = the bracketed name. Infer brand/model from the text (empty string if "
    "unknown). 'fact' = one clean, self-contained factual sentence in Bahasa Indonesia "
    "(include price/DP/specs as stated). Merge duplicates. Skip pure greetings/chit-chat. "
    "Set needs_verification=true for any price, stock, or time-bound promo. Omit messages "
    "with no usable fact."
)


def distill(out: str, model: str, batch_size: int, max_batches: int) -> int:
    import httpx

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        print("ANTHROPIC_API_KEY not set"); return 1
    cand_path = os.path.join(out, "agent_facts_candidates.jsonl")
    recs = [json.loads(l) for l in open(cand_path, encoding="utf-8")]
    if max_batches > 0:
        recs = recs[: batch_size * max_batches]
    print(f"distilling {len(recs):,} candidates with {model} (batch={batch_size})")

    facts, in_tok, out_tok, failed = [], 0, 0, 0
    for start in range(0, len(recs), batch_size):
        batch = recs[start : start + batch_size]
        lines = [f"{i+1}. [{r['agent'] or '?'}] {' '.join(r['text'].split())}"
                 for i, r in enumerate(batch)]
        try:
            resp = httpx.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": api_key, "anthropic-version": "2023-06-01",
                         "content-type": "application/json"},
                json={"model": model, "max_tokens": 4096,
                      "system": [{"type": "text", "text": DISTILL_SYS,
                                  "cache_control": {"type": "ephemeral"}}],
                      "messages": [{"role": "user", "content": "Messages:\n" + "\n".join(lines)}]},
                timeout=120,
            )
            resp.raise_for_status()
            data = resp.json()
            u = data.get("usage", {})
            in_tok += u.get("input_tokens", 0); out_tok += u.get("output_tokens", 0)
            txt = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
            arr = json.loads(txt[txt.index("["): txt.rindex("]") + 1])
            facts.extend(arr)
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"  batch {start//batch_size} failed: {type(e).__name__}: {str(e)[:120]}")
        print(f"  {start+len(batch):>5}/{len(recs)} done, {len(facts):,} facts", end="\r")

    # Dedupe distilled facts by (brand, model, fact).
    seen, uniq = set(), []
    for f in facts:
        k = (str(f.get("brand", "")).lower(), str(f.get("model", "")).lower(),
             norm(str(f.get("fact", ""))))
        if k in seen or not f.get("fact"):
            continue
        seen.add(k); uniq.append(f)

    jl = os.path.join(out, "facts_distilled.jsonl")
    with open(jl, "w", encoding="utf-8") as fo:
        for f in uniq:
            fo.write(json.dumps(f, ensure_ascii=False) + "\n")

    # Human-review markdown grouped by dealer -> brand.
    from collections import defaultdict
    tree: dict = defaultdict(lambda: defaultdict(list))
    for f in uniq:
        tree[f.get("dealer") or "(unknown)"][f.get("brand") or "(unknown)"].append(f)
    md = os.path.join(out, "facts_review.md")
    with open(md, "w", encoding="utf-8") as fo:
        fo.write(f"# Distilled KB facts ({len(uniq):,} unique)\n\n")
        for dealer in sorted(tree):
            fo.write(f"## {dealer}\n\n")
            for brand in sorted(tree[dealer]):
                fo.write(f"### {brand}\n")
                for f in tree[dealer][brand]:
                    flag = " `[VERIFY]`" if f.get("needs_verification") else ""
                    fo.write(f"- ({f.get('category','?')}) {f.get('fact','')}{flag}\n")
                fo.write("\n")

    cost = in_tok / 1e6 * 1.0 + out_tok / 1e6 * 5.0  # ~Haiku 4.5 $/Mtok
    print(f"\n{'='*60}\nfacts (raw) {len(facts):,} -> unique {len(uniq):,} | failed batches {failed}")
    print(f"tokens in={in_tok:,} out={out_tok:,} | est cost ~${cost:.2f}")
    print(f"wrote {jl}\nwrote {md}\n{'='*60}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", help="folder with message-history-*.csv (analyze)")
    ap.add_argument("--out", default="./data")
    ap.add_argument("--distill", action="store_true", help="Phase 2: distill via Claude")
    ap.add_argument("--model", default="claude-haiku-4-5-20251001")
    ap.add_argument("--batch-size", type=int, default=40)
    ap.add_argument("--max-batches", type=int, default=0, help="0 = all; >0 = test on N batches")
    args = ap.parse_args()
    if args.distill:
        return distill(args.out, args.model, args.batch_size, args.max_batches)
    if not args.src:
        ap.error("--src required for analyze phase")
    return analyze(args.src, args.out)


if __name__ == "__main__":
    raise SystemExit(main())
