# Scalability Review

## Target Scale
- 100 dealerships
- 1,000 agents
- 100,000 conversations/month
- 1,000,000 messages/month

This translates to roughly ~33,000 messages per day, or a very manageable average of < 1 TPS (Transactions Per Second). Peak loads (e.g., broadcast campaigns) might spike to 50-100 TPS.

## Component Evaluation

1. **Database (PostgreSQL via pgx):** 
   - 1M messages/month is trivial for Postgres.
   - *Risk:* Connection exhaustion if `pgxpool` limits are not tuned or if long-running queries block the pool.
   - *Mitigation:* Ensure `pgxpool.MaxConns` is configured appropriately and use a PGBouncer if horizontally scaling backend nodes.

2. **Event Bus (NATS):**
   - NATS is capable of millions of messages per second. The 100 TPS peak load is well within its bounds.
   - *Risk:* NATS Core does not guarantee persistence. If a consumer is down, messages might be lost.
   - *Mitigation:* Ensure JetStream is enabled for critical streams (e.g., `events.message.received`) to guarantee at-least-once delivery.

3. **WebSocket (Realtime Service):**
   - 1,000 agents connected simultaneously is standard. Gorilla WebSocket can handle tens of thousands per node.
   - *Risk:* Unauthenticated connections (relying on `?org=`) will cause massive security and performance issues if hit by a botnet.
   - *Mitigation:* JWT Auth in the initial HTTP upgrade handshake.

4. **AI Processing:**
   - *Risk:* The 4h follow-up cron runs on the Gateway. Loading thousands of active threads into memory to call Anthropic sequentially will exhaust memory and cause Anthropic rate-limits (HTTP 429).
   - *Mitigation:* The cron should only query IDs, then publish an event (e.g., `cmd.ai.generate_followup`) to NATS, allowing a pool of worker nodes to process them with exponential backoff for rate limits.

## Operational Risks
- **No CI/CD:** You cannot scale operations if you deploy by SSH-ing into a server and running `docker-compose up`.
- **Manual Migrations:** Running SQL scripts manually is a guaranteed incident waiting to happen across 100 tenants. Use a standard tool like `golang-migrate` attached to the deployment pipeline.
