# Idempotency Strategy

## The Reality of Webhooks
The Lead Lifecycle assumes `[Inbound Webhook]` triggers exactly once per message. In reality, Meta/WhatsApp webhooks guarantee "at-least-once" delivery. If SimpulX takes too long to respond with an HTTP 200, Meta will retry the webhook. Network hiccups will also cause duplicate deliveries.

## Missing Protection: Duplicate Webhooks
If a duplicate webhook bypasses the gateway and reaches the State Machine:
- The system might try to create the lead twice (partially protected by DB constraints).
- Worse, the system might append duplicate messages to the UI, causing agent confusion.
- The AI Copilot might be triggered twice, doubling Anthropic API costs.

## Production Idempotency Design

**1. The `wamid` Key:**
Every WhatsApp message has a globally unique ID (e.g., `wamid.HBgLNjI4...`). This is the ultimate idempotency key.

**2. The Gateway Redis Debouncer:**
Before processing, the Gateway sets a short-lived key in Redis to act purely as a debounce mechanism for rapid-fire duplicate webhooks:
`SETNX webhook:debounce:<wamid> 1 EX 10` (expires in 10 seconds).
- If `SETNX` returns 1: Proceed to Database processing.
- If `SETNX` returns 0: This is a rapid-fire duplicate. Immediately return HTTP 200 to Meta and **drop** the payload.

**3. PostgreSQL Source of Truth & Transactional Outbox (Messaging Service):**
Redis is volatile and NOT the source of truth. True idempotency relies on PostgreSQL.
The `messages` table enforces a `UNIQUE(external_id, organization_id)` constraint.
When the `messaging` service receives an inbound webhook payload via NATS (or handles an outbound API send), it executes the following in a **single database transaction**:
1. Insert the new message into the `messages` table (using `ON CONFLICT DO NOTHING`).
2. Insert the NATS event payload (`events.message.persisted`) into the `outbox_events` table.
3. Commit transaction.

If step 1 hits a unique constraint violation (duplicate), the transaction is rolled back and the `messaging` worker gracefully ACKs the NATS message without inserting anything into the Outbox.
A background `runOutboxRelay` worker inside `messaging` constantly polls `outbox_events` and publishes them to NATS reliably.

**4. Idempotent NATS Consumers:**
Downstream workers reading from NATS (e.g., the AI worker) must assume JetStream may redeliver events. Every consumer operation must use `UPSERT` logic or perform a read-before-write validation to guarantee safe, repeated executions.
