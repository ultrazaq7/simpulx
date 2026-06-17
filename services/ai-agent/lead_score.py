"""Serving for the buy-potential Lead Score (CatBoost).

On each inbound message the orchestrator calls `score_and_update`, which rebuilds
the SAME feature row used in training (features.compute_features) - behavioral
numerics + categorical brand/model/city/source - runs the model, and writes a
0-100 score onto the conversation for "call first" ranking in the inbox.

- The score is a PRIORITIZATION signal (buy potential), not a sales-outcome
  prediction, and never auto-acts. The human decides.
- Lazy + optional: if the model artifact (or catboost) is absent, this is a
  silent no-op, so the service runs fine before any model is trained.
- Categorical fields come from the LLM-extracted conversation columns
  (car_brand/car_model/city) and are normalized by the SAME functions used at
  train time, so there is no train/serve skew. Missing -> "unknown".
"""
from __future__ import annotations

import json
import os
from typing import Optional

import features

_MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
_MODEL_PATH = os.path.join(_MODEL_DIR, "lead_score.cbm")
_CARD_PATH = os.path.join(_MODEL_DIR, "model_card.json")

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
            log.info("lead_score: catboost not installed; scoring disabled")
            _logged_missing = True
        return None
    if not os.path.exists(_MODEL_PATH):
        _model = None
        if log and not _logged_missing:
            log.info("lead_score: no model artifact at %s; scoring disabled", _MODEL_PATH)
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
        log.info("lead_score: model loaded (version=%s)", _version)
    return m


async def score_and_update(pool, conv_id: str, log=None) -> Optional[float]:
    """Compute the 0-100 buy-potential score for a conversation and persist it."""
    model = _load(log)
    if model is None:
        return None
    import pandas as pd  # local: only needed when a model is present

    turns, meta, entities = await _load_conversation(pool, conv_id)
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
                 lead_score = $2,
                 lead_score_model_version = $3,
                 lead_score_at = now()
               WHERE id = $1""",
            conv_id, score, _version,
        )
    if log:
        log.info("lead scored", extra={"conv": conv_id, "score": score})
    return score


async def _load_conversation(pool, conv_id: str):
    """Pull the live conversation into the (turns, meta, entities) shape."""
    async with pool.acquire() as conn:
        msgs = await conn.fetch(
            """SELECT direction, type, body, created_at
                 FROM messages WHERE conversation_id = $1 ORDER BY created_at""",
            conv_id,
        )
        cv = await conn.fetchrow(
            """SELECT COALESCE(call_attempts, 0)      AS call_attempts,
                      COALESCE(total_call_duration, 0) AS total_call_duration,
                      car_brand, car_model, city
                 FROM conversations WHERE id = $1""",
            conv_id,
        )
        ad_clicks = await conn.fetchval(
            "SELECT count(*) FROM conversation_attributions WHERE conversation_id = $1", conv_id
        ) or 0

    turns = [
        {"direction": m["direction"], "text": m["body"] or "",
         "ts": m["created_at"], "mtype": m["type"] or "text"}
        for m in msgs
    ]
    total_call = float(cv["total_call_duration"]) if cv else 0.0
    meta = {
        "n_calls": int(cv["call_attempts"]) if cv else 0,
        "total_call_duration_sec": total_call,
        "any_call_connected": total_call > 0,
        "from_ad": ad_clicks > 0,
        "ad_clicks": int(ad_clicks),
    }
    entities = {"brand": cv["car_brand"], "model": cv["car_model"], "city": cv["city"]} if cv else {}
    return turns, meta, entities
