# Updated Risk Analysis

| Risk Area | Description | Probability | Impact | Mitigation Strategy |
|---|---|---|---|---|
| **Data Modeling** | If the database maps exactly one `referral_source_id` column on the `conversations` table, subsequent ad clicks will either overwrite the original source (losing data) or fail to be captured. | **High** | **High** | Introduce a `conversation_attributions` table (or JSONB array) to track the timestamp and source of every Meta Campaign click that routes to the existing lead. |
| **Routing Overwrites** | A flawed upsert/routing query might accidentally trigger the `rr_cursor` increment and reassign the lead when a second Meta Campaign click arrives. | **High** | **Critical** | Ensure the `routeToCampaign` (round-robin) CTE strictly checks `WHERE assigned_agent_id IS NULL`. Existing leads must bypass the round-robin engine entirely. |
| **Security (IDOR)** | WebSocket connections trust client-provided `?org=` parameters instead of validating JWTs. (Unchanged from previous review). | **High** | **Critical** | Enforce JWT validation during the WS upgrade handshake. |
| **Cross-SimpulX Context Bleed** | A customer texts an ambiguous message. If they have active leads in TWO different SimpulX Campaigns (e.g., Honda and Toyota), the "latest active lead" heuristic might route a Honda question to the Toyota agent. | **High** | **High** | Implement strict TTLs for active conversations. Stale threads must not hijack ambiguous plain-text messages. |
| **Double-Webhook Concurrency** | Two webhooks arrive for the *same* new contact simultaneously from a Meta ad. | **Medium** | **Medium** | Enforce `UNIQUE(contact_id, simpulx_campaign_id)` where `status != closed` to prevent duplicate leads in the same pool. |
| **Agent Offline Blackhole** | A net-new lead is assigned to an offline agent via round-robin and sits unread. | **High** | **Medium** | Implement an SLA timer or check presence before initial assignment. |
