"""Behavioral + categorical feature extraction for the buy-potential score (CatBoost).

ONE source of truth shared by training (scripts/build_features.py, on the
SmartKonek CSV export) and serving (lead_score.py, on live Postgres rows). Both
normalize their raw data into the same `turns` + `meta` + `entities` shape and
call `compute_features`, so features can never drift between train and serve.

Two feature groups:
- NUMERIC (behavioral): counts, ratios, latencies, intent-keyword flags, time.
- CATEGORICAL (domain): brand / model / city / source - CatBoost handles these
  natively (no one-hot). These are the strongest signals in car sales.

Anti-leakage guardrail: features are behavioral + factual ONLY. We never feed
the LLM's interest/buy judgment (that's the training target). brand/model/city
are FACTS, so they are allowed.

Categorical values are canonicalized by shared normalizers so the LLM-extracted
field at serve time and the gazetteer match at train time land on the same token.

`turns`: list[dict] {direction, text, ts, mtype} ordered by time.
`meta`:  {n_calls, total_call_duration_sec, any_call_connected, from_ad, ad_clicks}.
`entities`: {brand, model, city} raw strings (LLM-extracted at serve, gazetteer at train).
"""
from __future__ import annotations

import re
import statistics
from typing import Dict, List, Optional

from classifier import INTENT_CATEGORIES, OFF_TOPIC, STRONG_INTENT

NAN = float("nan")
UNKNOWN = "unknown"

_INTENT_RE = {cat: re.compile("|".join(pats)) for cat, pats in INTENT_CATEGORIES.items()}
_OFF_TOPIC_RE = re.compile("|".join(OFF_TOPIC))


def _slug(category: str) -> str:
    return "intent_" + re.sub(r"[^a-z0-9]+", "_", category.lower()).strip("_")


_INTENT_FEATURES = [_slug(c) for c in INTENT_CATEGORIES]

NUMERIC_FEATURES: List[str] = [
    "n_inbound", "n_outbound", "total_msgs", "inbound_outbound_ratio",
    "conversation_duration_min", "first_response_latency_sec", "median_agent_response_latency_sec",
    "n_media_inbound", "n_calls", "total_call_duration_sec", "any_call_connected",
    "from_ad", "ad_clicks", "hour_of_first_msg", "day_of_week", "is_off_topic",
    "intent_category_count", "has_strong_intent",
    *_INTENT_FEATURES,
]
CATEGORICAL_FEATURES: List[str] = ["cat_brand", "cat_model", "cat_city", "cat_source"]
FEATURE_ORDER: List[str] = NUMERIC_FEATURES + CATEGORICAL_FEATURES
CAT_FEATURE_INDICES: List[int] = list(range(len(NUMERIC_FEATURES), len(FEATURE_ORDER)))

# ---- Gazetteers (alias -> canonical). Shared by train scan + serve normalize. ----
_BRANDS = {
    "honda": ["honda"], "toyota": ["toyota"], "daihatsu": ["daihatsu"],
    "mitsubishi": ["mitsubishi", "mitsu"], "suzuki": ["suzuki"], "hyundai": ["hyundai"],
    "wuling": ["wuling"], "nissan": ["nissan"], "mazda": ["mazda"], "kia": ["kia"],
    "byd": ["byd"], "chery": ["chery"], "dfsk": ["dfsk"], "isuzu": ["isuzu"],
    "bmw": ["bmw"], "mercedes": ["mercedes", "mercy"],
}
_MODELS = {
    "brio": ["brio"], "mobilio": ["mobilio"], "hrv": ["hr-v", "hr v", "hrv"],
    "brv": ["br-v", "br v", "brv"], "crv": ["cr-v", "crv"], "civic": ["civic"],
    "jazz": ["jazz"], "wrv": ["wr-v", "wrv"], "avanza": ["avanza"], "xenia": ["xenia"],
    "rush": ["rush"], "terios": ["terios"], "raize": ["raize"], "calya": ["calya"],
    "sigra": ["sigra"], "agya": ["agya"], "ayla": ["ayla"],
    "innova": ["innova", "zenix"], "fortuner": ["fortuner"], "yaris": ["yaris"],
    "veloz": ["veloz"], "pajero": ["pajero"], "xpander": ["xpander"], "triton": ["triton"],
    "ertiga": ["ertiga"], "xl7": ["xl-7", "xl7"], "creta": ["creta"],
    "stargazer": ["stargazer"], "santafe": ["santa fe", "santafe"], "ioniq": ["ioniq"],
    "dolphin": ["dolphin"], "atto": ["atto"], "seal": ["seal"], "almaz": ["almaz"],
    "confero": ["confero"], "cortez": ["cortez"], "airev": ["air ev", "airev"],
}
_CITIES = {
    "jakarta": ["jakarta", "jkt"], "bandung": ["bandung", "bdg"],
    "surabaya": ["surabaya", "sby"], "medan": ["medan"], "semarang": ["semarang"],
    "makassar": ["makassar", "makasar"], "palembang": ["palembang"], "depok": ["depok"],
    "tangerang": ["tangerang", "tangsel"], "bekasi": ["bekasi"], "bogor": ["bogor"],
    "yogyakarta": ["yogyakarta", "jogja", "yogya", "jogjakarta"], "malang": ["malang"],
    "denpasar": ["denpasar", "bali"], "balikpapan": ["balikpapan"], "pekanbaru": ["pekanbaru"],
    "padang": ["padang"], "samarinda": ["samarinda"], "banjarmasin": ["banjarmasin"],
    "pontianak": ["pontianak"], "manado": ["manado"], "cirebon": ["cirebon"],
    "solo": ["solo", "surakarta"],
}


def _match(gaz: Dict[str, List[str]], raw: Optional[str]) -> str:
    """Find the first canonical key whose alias appears in `raw`. Used for BOTH
    serve (normalize an LLM field) and train (scan a message blob)."""
    if not raw:
        return UNKNOWN
    s = " " + re.sub(r"\s+", " ", str(raw).lower()) + " "
    for canon, aliases in gaz.items():
        for a in aliases:
            if a in s:
                return canon
    return UNKNOWN


def normalize_brand(raw: Optional[str]) -> str:
    return _match(_BRANDS, raw)


def normalize_model(raw: Optional[str]) -> str:
    return _match(_MODELS, raw)


def normalize_city(raw: Optional[str]) -> str:
    return _match(_CITIES, raw)


def scan_entities(text: str) -> Dict[str, str]:
    """Train-side: pull brand/model/city out of raw conversation text."""
    return {"brand": normalize_brand(text), "model": normalize_model(text), "city": normalize_city(text)}


def compute_features(turns: List[dict], meta: Optional[dict] = None,
                     entities: Optional[dict] = None) -> Dict[str, float]:
    """Full feature dict (keys == FEATURE_ORDER). Numeric missing -> NaN
    (CatBoost-native); categorical missing -> 'unknown' (CatBoost needs a string)."""
    meta = meta or {}
    entities = entities or {}
    feats: Dict[str, float] = {k: 0.0 for k in NUMERIC_FEATURES}

    inbound = [t for t in turns if t.get("direction") == "inbound"]
    outbound = [t for t in turns if t.get("direction") == "outbound"]
    n_in, n_out = len(inbound), len(outbound)

    feats["n_inbound"] = float(n_in)
    feats["n_outbound"] = float(n_out)
    feats["total_msgs"] = float(n_in + n_out)
    feats["inbound_outbound_ratio"] = float(n_in / n_out) if n_out else NAN
    feats["n_media_inbound"] = float(sum(1 for t in inbound if (t.get("mtype") or "text") != "text"))

    ts = [t["ts"] for t in turns if t.get("ts") is not None]
    feats["conversation_duration_min"] = (max(ts) - min(ts)).total_seconds() / 60.0 if len(ts) >= 2 else NAN
    gaps = _agent_response_gaps(turns)
    feats["first_response_latency_sec"] = gaps[0] if gaps else NAN
    feats["median_agent_response_latency_sec"] = statistics.median(gaps) if gaps else NAN
    first_ts = min(ts) if ts else None
    feats["hour_of_first_msg"] = float(first_ts.hour) if first_ts else NAN
    feats["day_of_week"] = float(first_ts.weekday()) if first_ts else NAN

    feats["n_calls"] = float(meta.get("n_calls", 0) or 0)
    feats["total_call_duration_sec"] = float(meta.get("total_call_duration_sec", 0) or 0)
    feats["any_call_connected"] = 1.0 if meta.get("any_call_connected") else 0.0
    feats["from_ad"] = 1.0 if meta.get("from_ad") else 0.0
    feats["ad_clicks"] = float(meta.get("ad_clicks", 0) or 0)

    blob = "\n".join((t.get("text") or "") for t in inbound).lower()
    feats["is_off_topic"] = 1.0 if _OFF_TOPIC_RE.search(blob) else 0.0
    hits = []
    for cat, rx in _INTENT_RE.items():
        hit = 1.0 if rx.search(blob) else 0.0
        feats[_slug(cat)] = hit
        if hit:
            hits.append(cat)
    feats["intent_category_count"] = float(len(hits))
    feats["has_strong_intent"] = 1.0 if any(c in STRONG_INTENT for c in hits) else 0.0

    # ---- categorical (strings) ----
    feats["cat_brand"] = normalize_brand(entities.get("brand"))
    feats["cat_model"] = normalize_model(entities.get("model"))
    feats["cat_city"] = normalize_city(entities.get("city"))
    feats["cat_source"] = "ad" if meta.get("from_ad") else "organic"
    return feats


def _agent_response_gaps(turns: List[dict]) -> List[float]:
    gaps: List[float] = []
    pending_in = None
    for t in turns:
        ts = t.get("ts")
        if t.get("direction") == "inbound":
            if pending_in is None:
                pending_in = ts
        elif t.get("direction") == "outbound" and pending_in is not None and ts is not None:
            delta = (ts - pending_in).total_seconds()
            if delta >= 0:
                gaps.append(delta)
            pending_in = None
    return gaps
