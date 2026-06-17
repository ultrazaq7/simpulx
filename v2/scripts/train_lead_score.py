#!/usr/bin/env python3
"""train_lead_score.py - train the CatBoost buy-potential Lead Score.

Joins behavioral + categorical features (build_features.py -> features.jsonl)
with LLM proxy labels (label_conversations.py -> labeled.jsonl) on contact_id and
trains a binary classifier P(serious_buyer). CatBoost handles the categorical
brand/model/city/source natively (no one-hot). Saves the model to
services/ai-agent/models/lead_score.cbm (loaded by lead_score.py at serve time)
plus a model_card.json with metrics + feature order.

Each row is one contact, so a random split IS a split-by-contact (no leakage).

HONEST FRAMING: the target is an LLM proxy, so this predicts "lead quality as
judged by the LLM", not real sales. Ship as a buy-potential "Lead Score".
Retrain on real won/lost dispositions later (plan caveat).

Needs catboost + scikit-learn + pandas + numpy (in the ai-agent image).

Usage:
  python train_lead_score.py --in ./train_out --min-conf 0.6
"""
from __future__ import annotations

import argparse
import json
import os
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

MODEL_DIR = os.path.join(_SVC, "models")
MODEL_PATH = os.path.join(MODEL_DIR, "lead_score.cbm")
CARD_PATH = os.path.join(MODEL_DIR, "model_card.json")
AUC_GATE = 0.70


def load_join(indir: str, min_conf: float):
    feats = {}
    with open(os.path.join(indir, "features.jsonl"), encoding="utf-8") as f:
        for line in f:
            r = json.loads(line)
            feats[r.pop("contact_id")] = r
    rows, y = [], []
    kept = skipped = no_feats = 0
    with open(os.path.join(indir, "labeled.jsonl"), encoding="utf-8") as f:
        for line in f:
            r = json.loads(line)
            if float(r.get("confidence", 0)) < min_conf:
                skipped += 1
                continue
            fr = feats.get(r["contact_id"])
            if fr is None:
                no_feats += 1
                continue
            rows.append({k: fr.get(k) for k in features.FEATURE_ORDER})
            y.append(int(r["serious_buyer"]))
            kept += 1
    print(f"joined rows: {kept:,} (skipped low-conf {skipped:,}, no-features {no_feats:,})")

    X = pd.DataFrame(rows, columns=features.FEATURE_ORDER)
    for c in features.NUMERIC_FEATURES:
        X[c] = pd.to_numeric(X[c], errors="coerce")
    for c in features.CATEGORICAL_FEATURES:
        X[c] = X[c].fillna(features.UNKNOWN).astype(str)
    return X, np.array(y, dtype="int32")


def precision_at_k(y_true, scores, frac: float) -> float:
    k = max(1, int(len(scores) * frac))
    top = np.argsort(scores)[::-1][:k]
    return float(np.mean(y_true[top]))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="indir", default="./train_out")
    ap.add_argument("--min-conf", type=float, default=0.6)
    ap.add_argument("--test-size", type=float, default=0.2)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    X, y = load_join(args.indir, args.min_conf)
    if len(y) < 50:
        print(f"too few labeled rows ({len(y)}) - label more conversations first"); return 1
    pos, n = int(y.sum()), len(y)
    base_rate = pos / n
    print(f"rows={n:,}  positives={pos:,} ({base_rate*100:.1f}%)  features={X.shape[1]} "
          f"(cat={len(features.CATEGORICAL_FEATURES)})")

    Xtr, Xte, ytr, yte = train_test_split(
        X, y, test_size=args.test_size, random_state=args.seed, stratify=y
    )
    clf = CatBoostClassifier(
        iterations=400, depth=5, learning_rate=0.05,
        l2_leaf_reg=3.0, loss_function="Logloss", eval_metric="AUC",
        auto_class_weights="Balanced", cat_features=features.CATEGORICAL_FEATURES,
        random_seed=args.seed, verbose=False, allow_writing_files=False,
    )
    clf.fit(Xtr, ytr)

    p = clf.predict_proba(Xte)[:, 1]
    auc = roc_auc_score(yte, p)
    pr_auc = average_precision_score(yte, p)
    brier = brier_score_loss(yte, p)
    p10 = precision_at_k(yte, p, 0.10)
    p20 = precision_at_k(yte, p, 0.20)

    print("=" * 60)
    print(f"ROC-AUC            : {auc:.3f}   (gate >= {AUC_GATE})")
    print(f"PR-AUC             : {pr_auc:.3f}  (base rate {base_rate:.3f})")
    print(f"Brier (calibration): {brier:.3f}  (lower better)")
    print(f"Precision@10% (call-first) : {p10:.3f}")
    print(f"Precision@20%               : {p20:.3f}")
    print("\nTop features by importance:")
    imp = clf.get_feature_importance(prettified=True)
    for _, r in imp.head(15).iterrows():
        print(f"  {str(r['Feature Id']):<34} {r['Importances']:.2f}")
    print("=" * 60)

    passed = auc >= AUC_GATE
    print("SANITY GATE:", "PASS - safe to serve" if passed
          else f"FAIL - AUC {auc:.3f} < {AUC_GATE}; prefer heuristic, do not serve")

    os.makedirs(MODEL_DIR, exist_ok=True)
    version = "bootstrap-" + datetime.utcnow().strftime("%Y%m%d-%H%M")
    clf.save_model(MODEL_PATH)
    card = {
        "version": version, "algo": "catboost",
        "label_source": "llm_proxy (claude-haiku via label_conversations.py)",
        "trained_at": datetime.utcnow().isoformat() + "Z",
        "rows": n, "positives": pos, "base_rate": round(base_rate, 4),
        "metrics": {"roc_auc": round(float(auc), 4), "pr_auc": round(float(pr_auc), 4),
                    "brier": round(float(brier), 4),
                    "precision_at_10pct": round(p10, 4), "precision_at_20pct": round(p20, 4)},
        "sanity_gate_passed": bool(passed),
        "feature_order": features.FEATURE_ORDER,
        "categorical_features": features.CATEGORICAL_FEATURES,
        "note": "LLM proxy label - buy-potential Lead Score, NOT a sales-outcome prediction.",
    }
    json.dump(card, open(CARD_PATH, "w", encoding="utf-8"), indent=2)
    print(f"wrote {MODEL_PATH}\nwrote {CARD_PATH}  (version={version})")
    return 0 if passed else 2


if __name__ == "__main__":
    raise SystemExit(main())
