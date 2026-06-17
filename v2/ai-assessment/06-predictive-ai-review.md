# Predictive AI & ML Review

## The Appeal of Predictive AI
Features like Lead Scoring, Close Probability, Follow-Up Priority, and Lead Decay Prediction (often powered by models like XGBoost or LightGBM) are highly attractive in Enterprise SaaS pitches. 

## The Reality Check
**Recommendation: DO NOT build predictive ML models at this stage.**

To build a predictive model that outperforms a simple rules-based heuristic, the following prerequisites are required:

1. **Data Volume:** You need thousands of clearly labeled `Closed Won` and `Closed Lost` outcomes. Given that v2 is not yet deployed, this dataset does not exist.
2. **Data Cleanliness:** If agents don't accurately tag the CRM fields (e.g., leaving dead leads open, or failing to log test drives), the model will learn garbage patterns.
3. **Feature Engineering:** You need historical snapshots of state (e.g., "what did the lead look like on day 3?") not just the final state in the database.

## Strategy for Now
1. **Stick to Rules:** The current rules-based classifier (mapping intent to stages like `high_intent`, `considering`) is free, instantly explainable, and requires zero training data. Stick with it.
2. **Collect Telemetry:** Begin instrumenting exact timestamp changes for state transitions (e.g., time from `new` to `replied`, time to `closed`).
3. **Re-evaluate in 6-12 Months:** Once the system has processed >100,000 real conversations with strict disposition logging, you can export a CSV and train a baseline XGBoost model.

## If Forced to Implement Early
If investors or stakeholders mandate a "Predictive Scoring" feature today:
- Fake it with a heuristic formula.
- `Score = (Agent Reply Time weight) + (Intent level weight) + (Extracted Fields count)`
- Present it as a "Lead Health Score" rather than a ML prediction.

## ADDENDUM (2026-06-03) — decision: bootstrap CatBoost now (supersedes "do not build")

We are building a real model now, with eyes open about the caveats above. Rationale and guardrails:

- **No real won/lost labels exist** (system not in production). So we **bootstrap** with a
  *proxy* label: Claude Haiku reads each historical SmartKonek thread and judges `serious_buyer`
  (`scripts/label_conversations.py`). This is honest distillation of the LLM's judgment, NOT a
  sales-outcome model — so it ships as a **buy-potential "Lead Score"**, never "close probability".
- **Algorithm = CatBoost** (not XGBoost): the strongest signals in car sales are categorical
  (brand/model/city/source); CatBoost handles them natively. Numeric behavioral features still
  included. Anti-leakage: the LLM's interest/buy judgment is excluded from features (it's the
  target); brand/model/city are facts and allowed. Shared normalizers keep train/serve parity.
- **The "collect telemetry" advice still holds and is the real endgame:** `ai_extracted_at`,
  disposition logging, and `conversation_events` accumulate ground truth. **Retrain the SAME
  pipeline** on real `dispositions.category=won/lost` once production has thousands of outcomes —
  at which point this becomes a genuine predictive model and the proxy is dropped.
- See [../ai-context/15-ai-engine.md](../ai-context/15-ai-engine.md) for the implementation.
