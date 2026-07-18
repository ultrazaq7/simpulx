"""Serving for the Closing Probability score (CatBoost).

Sibling of lead_score.py. Where lead_score predicts BUY POTENTIAL (an LLM-proxy
"how interested is this lead"), closing_probability predicts the SALES OUTCOME:
P(this conversation ends in a booking/purchase). It is trained (scripts/
train_closing.py) on a COMBINED label source:
  - real prod outcomes: conversations that reached the `booking` stage (=1) vs
    `lost_purchase`/`lost_not_purchase` (=0) — the ground truth, up-weighted;
  - historical SmartKonek CSV: a down-weighted proxy label (strong-closing
    keywords) that bootstraps the model before enough real outcomes exist.

Same guarantees as lead_score:
  - reuses the EXACT feature build (lead_score._load_conversation +
    features.compute_features) so there is zero train/serve skew;
  - lazy + optional: if the model artifact or catboost is missing, this is a
    silent no-op, so the service runs fine before a closing model is trained;
  - never auto-acts. The score ranks "closest to a sale" for the inbox / Next
    Best Action; the human decides.
"""
from __future__ import annotations

import json
import os
from typing import Optional

import features
import lead_score  # reuse the conversation loader (no feature-build duplication)

_MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
_MODEL_PATH = os.path.join(_MODEL_DIR, "closing_prob.cbm")
_CARD_PATH = os.path.join(_MODEL_DIR, "closing_model_card.json")

_model = "unloaded"  # "unloaded" -> CatBoostClassifier | None
_version = "unknown"
_logged_missing = False


def _load(log=None):
    global _model, _version, _logged_missing
    if _model != "unloaded":
        return _model
    try:
        from catboost import CatBoostClassifier  # noqa: WPS433 (optional heavy dep)
    except Exception:  # noqa: BLE001
        _model = None
        if log and not _logged_missing:
            log.info("closing_score: catboost not installed; scoring disabled")
            _logged_missing = True
        return None
    if not os.path.exists(_MODEL_PATH):
        _model = None
        if log and not _logged_missing:
            log.info("closing_score: no model artifact at %s; scoring disabled", _MODEL_PATH)
            _logged_missing = True
        return None
    m = CatBoostClassifier()
    m.load_model(_MODEL_PATH)
    _model = m
    if os.path.exists(_CARD_PATH):
        try:
            _version = json.load(open(_CARD_PATH, encoding="utf-8")).get("version", "unknown")
        except Exception:  # noqa: BLE001
            _version = "unknown"
    if log:
        log.info("closing_score: model loaded (version=%s)", _version)
    return m


async def score_and_update(pool, conv_id: str, log=None) -> Optional[float]:
    """Compute the 0-100 closing probability for a conversation and persist it."""
    model = _load(log)
    if model is None:
        return None
    import pandas as pd  # local: only needed when a model is present

    turns, meta, entities = await lead_score._load_conversation(pool, conv_id)
    if not turns:
        return None

    feats = features.compute_features(turns, meta, entities)
    df = pd.DataFrame([{k: feats.get(k) for k in features.FEATURE_ORDER}], columns=features.FEATURE_ORDER)
    for c in features.NUMERIC_FEATURES:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    for c in features.CATEGORICAL_FEATURES:
        df[c] = df[c].astype(str)
    prob = float(model.predict_proba(df)[0, 1])
    score = round(prob * 100.0, 2)

    async with pool.acquire() as conn:
        await conn.execute(
            """UPDATE conversations SET
                 closing_probability = $2,
                 closing_prob_model_version = $3,
                 closing_prob_at = now()
               WHERE id = $1""",
            conv_id, score, _version,
        )
    if log:
        log.info("closing scored", extra={"conv": conv_id, "score": score})
    return score
