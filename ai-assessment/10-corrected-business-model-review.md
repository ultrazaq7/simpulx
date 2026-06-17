# Corrected Business Model Review

## The Model Correction
The previous review incorrectly conflated Meta Campaigns (ad sets/marketing initiatives) with SimpulX Campaigns (agent pools/dealer instances). 

**The true hierarchy is:**
`Organization` → `SimpulX Campaign` (e.g., Honda Jakarta) → `Agent Pool`

**The true attribution model is:**
`Meta Campaign` (e.g., HRV Awareness, BRV Prospecting) is merely an inbound traffic source that maps to a specific `SimpulX Campaign`.

## Impact on System Architecture

1. **Lead Uniqueness Constraints**
   - **Valid:** The recommendation for a `UNIQUE(contact_id, campaign_id)` constraint where `status != closed` remains 100% valid.
   - **Updated:** The `campaign_id` in this constraint must strictly be the `SimpulX Campaign ID`. 

2. **Lead Ownership Model**
   - **Valid:** Agents own leads within their SimpulX Campaign.
   - **Updated:** "Lead Stealing" or re-distribution is strictly forbidden if a known contact clicks a new Meta ad belonging to the same SimpulX Campaign. The existing agent (e.g., Agent B) retains ownership indefinitely (or until the lead is closed).

3. **Attribution History Model**
   - **Invalid:** Assuming a 1-to-1 relationship between a conversation/lead and an attribution source.
   - **Updated:** The system requires a `1:Many` relationship between a Lead (Conversation) and Attribution Sources. A new table (e.g., `conversation_attributions`) or a `JSONB` append-only array on the conversation row is necessary to track the multi-touch journey without mutating the original lead assignment.

4. **Conversation Routing & Fair Distribution**
   - **Invalid:** Routing and round-robin based purely on the Meta ad referral.
   - **Updated:** The inbound routing logic must execute a two-step resolution:
     1. Resolve Meta Campaign ID → parent SimpulX Campaign ID.
     2. Query active conversations for `(contact_id, simpulx_campaign_id)`.
     3. **If exists:** Route message to existing conversation. Append new Meta Campaign to the attribution history. **Do NOT run round-robin.**
     4. **If not exists:** Create a new conversation. Run the fair distribution engine (round-robin) to assign an agent.

5. **AI Scoring Implications**
   - **Updated:** A multi-touch attribution model is a goldmine for Intent Scoring. A lead that clicks "HRV Awareness" and later clicks "BRV Prospecting" demonstrates significantly higher intent than a single-touch lead. While full Predictive ML is still premature, the Rules Classifier can immediately use "multiple attributions" as a trigger to upgrade a lead's intent stage.
