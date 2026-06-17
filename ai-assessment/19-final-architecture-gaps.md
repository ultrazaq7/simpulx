# Final Architecture Consistency Review

This review synthesizes all previous documents to expose the final layer of hidden production risks, specifically focusing on distributed systems consistency, database integrity, and operational cost controls.

## 1. Contradictions & Logic Gaps
* **The "Deactivated Agent" Routing Contradiction:** *Doc 10* mandates that if an existing lead clicks a new ad, routing bypasses Round-Robin and goes directly to the existing assigned agent. However, if that agent was deactivated (as per *Doc 11*), the system will blindly route a new inquiry to a dead account.
  * **Gap:** The routing logic lacks a validation step to ensure `assigned_agent_id` is still an active member of `campaign_agents`.
* **The "Oops" State Transition:** *Doc 10* dictates that Closed leads entering via a new ad create a *new* lead instance. 
  * **Gap:** There is no state transition defined for an agent accidentally clicking "Close" and needing to manually "Reopen" the lead within a grace period. Without this, agents will be forced to ask customers to click an ad again just to reset the state machine.

## 2. Missing Database Constraints
* **Agent-Campaign Validation:** `assigned_agent_id` on the `conversations` table lacks a composite foreign key constraint to `campaign_agents(campaign_id, user_id)`. Without this, an API bug could assign a lead to an agent who doesn't belong to the SimpulX Campaign, violating tenant isolation.
* **Status Data Integrity:** If `status = 'closed'`, the database must enforce `CHECK (closed_at IS NOT NULL AND closed_by IS NOT NULL)` to guarantee audit trail integrity.

## 3. Missing Indexes
* **WhatsApp Heuristic Routing:** The fallback routing relies on finding the "latest active lead." 
  * **Gap:** Missing `CREATE INDEX idx_conversations_latest ON conversations(contact_id, last_message_at DESC) WHERE status = 'active';`. Without this, the system will sequence-scan the contacts table for every ambiguous WhatsApp message.

## 4. Race Conditions & Conversation Locking
* **The Read-Modify-Write Race:** An agent manually updates a lead's custom fields in the UI. At the exact same millisecond, a webhook arrives and the AI Copilot updates the `interest_level`. 
  * **Gap:** If using an ORM without optimistic concurrency (e.g., a `version` column) or failing to use strict SQL `UPDATE ... SET` partial updates, the last write wins, overwriting the other's changes.
* **Concurrent Escalation:** The SLA worker attempts to generate a missed SLA report at the exact millisecond a Supervisor forces a manual transfer.
  * **Gap:** Missing `SELECT ... FOR UPDATE` row-level locking during state transitions.

## 5. AI Cost Controls
* **The "Rapid-Fire" Customer:** WhatsApp users frequently send messages line-by-line (e.g., "Halo" [send] "Saya" [send] "Mau beli" [send]). 
  * **Gap:** If Agent Assist (suggested replies) or the AI Classifier triggers on every `events.message.received`, the system will make 3 Anthropic API calls for one sentence. This will skyrocket LLM costs and hit rate limits instantly. 
  * **Gap:** The architecture is missing a "Debouncer" strategy (e.g., waiting 5-10 seconds after the last message before publishing the AI evaluation event).

## 6. Transaction Boundaries & Outbox Pattern
* **The Dual-Write Problem:** When a message arrives, the system writes to Postgres (messages, conversations) and publishes to NATS.
  * **Gap:** If the Postgres transaction commits but the NATS publish fails (network blip), the realtime UI never updates. If NATS publishes but Postgres rolls back, consumers react to phantom data.
  * **Gap:** The architecture is missing the **Transactional Outbox Pattern**. NATS events must be written to an `outbox` table within the same Postgres transaction, then relayed to NATS asynchronously.

## 7. NATS Delivery Guarantees
* **AckWait vs AI Latency:** JetStream guarantees at-least-once delivery based on the `AckWait` configuration.
  * **Gap:** If the AI Copilot consumer takes 15 seconds to call Anthropic, but the NATS `AckWait` is set to the default (typically 5 seconds), NATS will assume the consumer died and infinitely redeliver the message, causing massive LLM duplication and DB constraint errors. `AckWait` must be tuned to exceed the maximum possible AI timeout.

## 8. Data Retention Strategy
* **Infinite Growth & PII:** The `messages` and `audit_log` tables will grow by millions of rows per month.
  * **Gap:** There is no defined data retention or archiving strategy. Keeping 5 years of chat history in hot Postgres will degrade indexing performance and backup times. The architecture needs a table partitioning strategy (e.g., partitioned by month) and a cold-storage archival process (e.g., moving >1 year old messages to MinIO/S3).
