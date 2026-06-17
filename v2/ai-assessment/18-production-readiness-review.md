# Production Readiness Review

As a Staff Engineer, reviewing the proposed Lead Lifecycle, Operational Edge Cases, and Idempotency strategies reveals several subtle contradictions, missing constraints, and distributed systems failure modes that will cause incidents at scale.

## 1. Contradictions Between Documents
* **Definition of "Dormant/Stale":** 
  * *Doc 10 (Lifecycle)* states a lead becomes dormant if the *customer* has been silent for 30 days (triggering a bot prompt).
  * *Doc 12 (Edge Cases)* states a lead is transitioned to dormant if the *agent* ignores an SLA draft for 72 hours.
  * *Resolution:* These are two different states. The former is "Customer Dormant" (requires re-engagement). The latter is "Agent Neglect" (requires escalation report). They must be modeled as separate statuses (e.g., `dormant` vs `escalated`).

* **Closed Re-entry vs Unique Constraints:**
  * *Doc 02* mandates `UNIQUE(contact_id, simpulx_campaign_id) WHERE status != 'closed'`.
  * *Doc 10* states that if a closed lead clicks an ad, a *new* active lead is created.
  * *Risk:* If a user later attempts to manually "re-open" the old closed lead in the UI while the new active lead exists, the database will throw a constraint violation and crash the request. The UI must disable re-opening if an active lead already exists.

## 2. Missing Database Constraints
* **Tenant Isolation at the Row Level:** To prevent multi-tenant data bleed, every critical table (`conversations`, `messages`, `conversation_attributions`) must have an `organization_id` foreign key. Querying must always append `AND organization_id = $x`.
* **Foreign Key Cascades:** `conversation_attributions` must have a strict `FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE RESTRICT` to prevent orphaned attribution records.
* **Idempotency Constraint:** The `messages` table must have `UNIQUE(provider_message_id, organization_id)` to backstop the Redis lock.

## 3. Missing Indexes
Without these, the system will experience heavy table scans leading to DB lockups at 100,000+ rows:
1. **Routing CTE:** `CREATE INDEX idx_campaign_agents_routing ON campaign_agents(campaign_id, user_id);`
2. **SLA Worker:** `CREATE INDEX idx_conversations_sla ON conversations(status, last_agent_message_at) WHERE status = 'active';`
3. **Idempotency Check:** `CREATE UNIQUE INDEX idx_messages_provider_id ON messages(provider_message_id);`
4. **Active Lead Lookup:** `CREATE INDEX idx_conv_active_lookup ON conversations(contact_id, simpulx_campaign_id) WHERE status != 'closed';`

## 4. Race Conditions (The Redis Lock Trap)
* *Doc 13* proposes: `SETNX` in Redis -> Push to NATS -> Return 200.
* *The Bug:* If the Gateway successfully sets the Redis lock but crashes *before* pushing to NATS, the webhook is lost forever. Meta won't retry because we (eventually) return a timeout, but the lock is set for 24 hours. Any manual retry by the customer is ignored.
* *Fix:* The Redis `SETNX` lock must be extremely short-lived (e.g., 10 seconds) simply to debounce rapid-fire duplicate webhooks. True idempotency must rely on the NATS consumer performing a resilient UPSERT or relying on the DB unique constraint.

## 5. Multi-Tenant Security Risks
* **Webhook Spoofing:** If the inbound webhook endpoint is global (`/api/webhooks/meta`), an attacker could send a payload with a spoofed Meta Campaign ID belonging to another tenant. The Gateway must verify that the API token / Webhook Secret used to authenticate the request matches the `organization_id` of the resolved Meta Campaign.
* **NATS Subject Bleed:** NATS subjects must be tenant-isolated. If the subject is just `events.message.received`, a compromised microservice could listen to all tenant traffic. It must be structured as `org.<org_id>.events.message.received`.

## 6. Data Leakage Risks (Zombie WebSockets)
* *Doc 11* defines Agent Deactivation and Transfers.
* *The Bug:* If Agent A is deactivated, the backend reassigns their leads. However, if Agent A's browser is still open, their WebSocket connection remains active. They will continue to receive real-time message broadcasts for leads they no longer own.
* *Fix:* The `deactivate_user` or `transfer_lead` event must publish a strict `cmd.websocket.disconnect` or `cmd.websocket.unsubscribe` command to force the Realtime service to sever the connection or drop the topic subscription.

## 7. Failure Recovery Gaps
* **Anthropic Outage:** If the AI Copilot API goes down, the SLA worker will fail. If the SLA worker uses a naive cron, it will repeatedly attempt and fail, potentially dropping the task.
* *Fix:* The worker must use a proper Dead Letter Queue (DLQ) with exponential backoff.

## 8. NATS Consumer Failure Scenarios
* **Partial Commits:** If the `message.received` consumer successfully creates a `Conversation` in Postgres, but panics while extracting AI fields, JetStream will redeliver the event.
* *Risk:* The second delivery will hit the `UNIQUE(contact_id, simpulx_campaign_id)` constraint and fail entirely.
* *Fix:* NATS consumers must be fully idempotent. They must use `INSERT ... ON CONFLICT DO NOTHING` (or `UPDATE`) for the conversation, and check if the message already exists before attempting to insert it again.
