#!/usr/bin/env python3
"""train_closing.py - train the CatBoost Closing Probability model.

Predicts the SALES OUTCOME P(booking/purchase), NOT buy-potential. Uses a COMBINED
label source so it can bootstrap before enough real outcomes exist and then improve
as they accumulate (the "CSV now, DB going forward" design):

  1. REAL prod outcomes (ground truth, weight 1.0)  -- optional, via --db / DATABASE_URL
     conversations that reached the `booking` stage => 1, `lost_purchase` /
     `lost_not_purchase` => 0. Rebuilt with the SHARED feature extractor.
  2. HISTORICAL SmartKonek CSV (proxy, weight --proxy-weight, default 0.3)
     label = strong-closing keywords in the customer's own messages (deal/spk/
     bayar/booking/...). Noisy, so down-weighted; it only bootstraps cold-start.

As real outcomes grow, source (1) dominates and the proxy fades. The model card
records the exact mix and whether the sanity gate was evaluated on REAL holdout
data (it is NOT trustworthy while proxy-dominated - shipped as bootstrap only).

Reuses build_features.build (CSV -> features) and features.compute_features (DB ->
features), the SAME code used at serve time, so there is zero train/serve skew.

Needs catboost + scikit-learn + pandas + numpy (in the ai-agent image); asyncpg
only when --db is used.

Usage:
  # CSV-only bootstrap (today, no real outcomes yet):
  python train_closing.py --csv ../data-train
  # Combined once prod has booking/lost outcomes:
  DATABASE_URL=postgres://... python train_closing.py --csv ../data-train --db
"""
from __future__ import annotations

import argparse
import asyncio
import glob
import json
import os
import re
import sys
from datetime import datetime

import numpy as np
import pandas as pd
from catboost import CatBoostClassifier
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
from sklearn.model_selection import train_test_split

_SVC = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "services", "ai-agent"))
if _SVC not in sys.path:
    sys.path.insert(0, _SVC)
import features  # noqa: E402
import build_features as bf  # noqa: E402  (scripts/ on path via __main__)

MODEL_DIR = os.path.join(_SVC, "models")
MODEL_PATH = os.path.join(MODEL_DIR, "closing_prob.cbm")
CARD_PATH = os.path.join(MODEL_DIR, "closing_model_card.json")
AUC_GATE = 0.70
REAL_MIN = 200  # need at least this many REAL rows before the gate is trustworthy

# Proxy "reached purchase" keywords (from seed_from_smartkonek's STRONG set). A
# customer message containing one of these is a noisy signal the deal advanced to
# closing. Deliberately high-precision; down-weighted at fit time.
_PROXY_RE = re.compile(
    r"\b(deal|test drive|test-drive|booking|spk|ambil unit|transfer|bayar|siap order|"
    r"dp|tanda jadi|pesan unit|jadi ambil|fix ambil)\b", re.I)


def csv_rows(csv_dir: str):
    """Yield (features_dict, label, weight, source) from the SmartKonek CSV using a
    proxy closing label. Reuses build_features.build so features match serving."""
    paths = ([csv_dir] if csv_dir.lower().endswith(".csv")
             else sorted(glob.glob(os.path.join(csv_dir, "*.csv"))))
    if not paths:
        return
    threads = bf.build(paths)
    for _cid, (ordered, meta, entities) in threads.items():
        blob = "\n".join(t["text"] for t in ordered if t.get("direction") == "inbound")
        label = 1 if _PROXY_RE.search(blob or "") else 0
        yield features.compute_features(ordered, meta, entities), label, "proxy"


async def db_rows(dsn: str):
    """Yield (features_dict, label, 'real') from prod: booking=1, lost_*=0. Rebuilds
    the exact serving feature shape (turns + meta + lead_fields entities)."""
    import asyncpg  # local import: only needed with --db
    conn = await asyncpg.connect(dsn)
    try:
        convs = await conn.fetch(
            """SELECT c.id,
                      s.system_key,
                      COALESCE(c.call_attempts,0)       AS call_attempts,
                      COALESCE(c.total_call_duration,0) AS total_call_duration,
                      COALESCE(c.metadata,'{}'::jsonb)  AS metadata
                 FROM conversations c JOIN stages s ON s.id=c.stage_id
                WHERE s.system_key IN ('booking','lost_purchase','lost_not_purchase')""")
        for cv in convs:
            label = 1 if cv["system_key"] == "booking" else 0
            msgs = await conn.fetch(
                """SELECT direction, type, body, created_at
                     FROM messages WHERE conversation_id=$1 ORDER BY created_at""", cv["id"])
            if not msgs:
                continue
            ad_clicks = await conn.fetchval(
                "SELECT count(*) FROM conversation_attributions WHERE conversation_id=$1", cv["id"]) or 0
            turns = [{"direction": m["direction"], "text": m["body"] or "",
                      "ts": m["created_at"], "mtype": m["type"] or "text"} for m in msgs]
            total_call = float(cv["total_call_duration"])
            meta = {"n_calls": int(cv["call_attempts"]), "total_call_duration_sec": total_call,
                    "any_call_connected": total_call > 0, "from_ad": ad_clicks > 0,
                    "ad_clicks": int(ad_clicks)}
            md = cv["metadata"]
            if isinstance(md, str):
                try:
                    md = json.loads(md)
                except Exception:
                    md = {}
            lf = (md or {}).get("lead_fields") if isinstance(md, dict) else {}
            if isinstance(lf, str):
                try:
                    lf = json.loads(lf)
                except Exception:
                    lf = {}
            lf = lf if isinstance(lf, dict) else {}
            entities = {"brand": lf.get("brand"), "model": lf.get("model"), "city": lf.get("city")}
            yield features.compute_features(turns, meta, entities), label, "real"
    finally:
        await conn.close()


def precision_at_k(y_true, scores, frac: float) -> float:
    k = max(1, int(len(scores) * frac))
    top = np.argsort(scores)[::-1][:k]
    return float(np.mean(y_true[top]))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", help="SmartKonek data-train dir or CSV (proxy labels)")
    ap.add_argument("--db", action="store_true", help="also pull real outcomes from DATABASE_URL")
    ap.add_argument("--dsn", default=os.environ.get("DATABASE_URL", ""))
    ap.add_argument("--proxy-weight", type=float, default=0.3)
    ap.add_argument("--test-size", type=float, default=0.2)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    rows, y, w, src = [], [], [], []

    def add(feat, label, source, weight):
        rows.append({k: feat.get(k) for k in features.FEATURE_ORDER})
        y.append(int(label)); w.append(float(weight)); src.append(source)

    if args.csv:
        for feat, label, source in csv_rows(args.csv):
            add(feat, label, source, args.proxy_weight)
    if args.db:
        if not args.dsn:
            ap.error("--db requires DATABASE_URL / --dsn")

        async def _pull():
            async for feat, label, source in db_rows(args.dsn):
                add(feat, label, source, 1.0)
        asyncio.run(_pull())

    n = len(y)
    n_real = sum(1 for s in src if s == "real")
    n_proxy = n - n_real
    if n < 50:
        print(f"too few rows ({n}) - need CSV and/or prod outcomes"); return 1
    pos = int(np.sum(y))
    print(f"rows={n:,}  real={n_real:,}  proxy={n_proxy:,}  positives={pos:,} "
          f"({pos/n*100:.1f}%)  proxy_weight={args.proxy_weight}")

    X = pd.DataFrame(rows, columns=features.FEATURE_ORDER)
    for c in features.NUMERIC_FEATURES:
        X[c] = pd.to_numeric(X[c], errors="coerce")
    for c in features.CATEGORICAL_FEATURES:
        X[c] = X[c].fillna(features.UNKNOWN).astype(str)
    y = np.array(y, dtype="int32"); w = np.array(w, dtype="float64")
    is_real = np.array([s == "real" for s in src])

    Xtr, Xte, ytr, yte, wtr, wte, rtr, rte = train_test_split(
        X, y, w, is_real, test_size=args.test_size, random_state=args.seed,
        stratify=y if pos >= 2 and (n - pos) >= 2 else None)

    clf = CatBoostClassifier(
        iterations=400, depth=5, learning_rate=0.05, l2_leaf_reg=3.0,
        loss_function="Logloss", eval_metric="AUC", auto_class_weights="Balanced",
        cat_features=features.CATEGORICAL_FEATURES, random_seed=args.seed,
        verbose=False, allow_writing_files=False)
    clf.fit(Xtr, ytr, sample_weight=wtr)

    # Evaluate on REAL holdout only when there is enough of it; otherwise the gate
    # is proxy-contaminated and must not be trusted.
    real_holdout = rte & (yte >= 0)
    gate_on_real = int(np.sum(real_holdout)) >= max(20, int(REAL_MIN * args.test_size))
    if gate_on_real:
        Xev, yev = Xte[real_holdout], yte[real_holdout]
    else:
        Xev, yev = Xte, yte
    p = clf.predict_proba(Xev)[:, 1]
    auc = roc_auc_score(yev, p) if len(np.unique(yev)) > 1 else float("nan")
    pr_auc = average_precision_score(yev, p) if len(np.unique(yev)) > 1 else float("nan")
    brier = brier_score_loss(yev, p) if len(np.unique(yev)) > 1 else float("nan")

    print("=" * 60)
    print(f"eval set           : {'REAL holdout' if gate_on_real else 'MIXED (proxy-contaminated)'}  n={len(yev)}")
    print(f"ROC-AUC            : {auc:.3f}   (gate >= {AUC_GATE})")
    print(f"PR-AUC             : {pr_auc:.3f}")
    print(f"Brier (calibration): {brier:.3f}")
    print("=" * 60)

    # Only pass the gate on a REAL evaluation; a proxy-only model is bootstrap that
    # ranks but should not be trusted as a true closing predictor.
    passed = gate_on_real and (auc == auc) and auc >= AUC_GATE  # auc==auc filters NaN
    if gate_on_real:
        print("SANITY GATE:", "PASS - real-outcome closing model" if passed
              else f"FAIL - AUC {auc:.3f} < {AUC_GATE}")
    else:
        print(f"SANITY GATE: NOT EVALUATED - only {int(np.sum(is_real))} real rows "
              f"(need ~{REAL_MIN}); shipping as PROXY BOOTSTRAP, do not trust as closing truth.")

    os.makedirs(MODEL_DIR, exist_ok=True)
    version = ("real-" if gate_on_real else "bootstrap-") + datetime.utcnow().strftime("%Y%m%d-%H%M")
    clf.save_model(MODEL_PATH)
    card = {
        "version": version, "algo": "catboost", "target": "closing_probability P(booking)",
        "trained_at": datetime.utcnow().isoformat() + "Z",
        "rows": n, "real_rows": n_real, "proxy_rows": n_proxy, "positives": pos,
        "proxy_weight": args.proxy_weight,
        "eval_on_real_holdout": bool(gate_on_real),
        "metrics": {"roc_auc": None if auc != auc else round(float(auc), 4),
                    "pr_auc": None if pr_auc != pr_auc else round(float(pr_auc), 4),
                    "brier": None if brier != brier else round(float(brier), 4)},
        "sanity_gate_passed": bool(passed),
        "feature_order": features.FEATURE_ORDER,
        "categorical_features": features.CATEGORICAL_FEATURES,
        "note": ("Real prod outcomes (booking vs lost) up-weighted + down-weighted SmartKonek "
                 "CSV proxy. Proxy-dominated versions are cold-start bootstrap, NOT ground truth."),
    }
    json.dump(card, open(CARD_PATH, "w", encoding="utf-8"), indent=2)
    print(f"wrote {MODEL_PATH}\nwrote {CARD_PATH}  (version={version})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
