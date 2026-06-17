# Database Design Audit

This review evaluates the PostgreSQL 16 (`pgvector`) schema for SimpulX v2 against a target scale of 100+ tenants, 1,000+ agents, and 1M+ messages per month. 

While the fundamental relational model is sound, the schema exhibits classic "MVP" database anti-patterns that will buckle under the heavy write-throughput of an omnichannel messaging platform. 

---

## P0: Critical Risks (Data Integrity & Outages)

**1. MVCC Tuple Bloat on `conversations` (The Hot Path)**
*   **The Risk:** The `conversations` table is incredibly wide. Updating `last_message_at`, `unread_count`, and `last_contact_message_at` on *every single incoming and outgoing message* will trigger PostgreSQL MVCC (Multi-Version Concurrency Control) to create a new row version every time. Because these columns will likely be indexed for the Inbox view, this breaks HOT (Heap-Only Tuples) updates, causing massive Write-Ahead Log (WAL) amplification, index bloat, and vacuuming death spirals.
*   **Fix:** Decouple high-frequency volatile counters from the wide `conversations` table, or strictly use `FILLFACTOR = 70` on the `conversations` table to allow room for in-page tuple updates.

**2. The `ON DELETE CASCADE` Time Bomb**
*   **The Risk:** The schema relies heavily on `ON DELETE CASCADE` from `organizations` and `contacts`. At 1M+ messages a month, deleting a single contact with 5,000 messages or an organization with 500,000 messages will trigger a synchronous cascading delete. This will lock up the database, blow out the transaction log, and cause a production outage.
*   **Fix:** Remove cascading deletes for massive child tables like `messages`, `conversation_events`, and `ai_runs`. Use soft-deletes (`deleted_at`), or rely on asynchronous background workers to prune orphaned records in small batches.

**3. Missing Webhook Idempotency Constraint**
*   **The Risk:** The `messages` table defines `external_id` (the Meta `wamid`), but does not enforce a unique constraint. If the Redis debounce fails, the system will insert duplicate messages.
*   **Fix:** Must enforce `UNIQUE (organization_id, external_id)` on the `messages` table. This is the absolute bedrock of the Transactional Outbox idempotency strategy.

---

## P1: High Risks (Performance & Scale)

**1. Lack of Table Partitioning for Time-Series Data**
*   **The Risk:** Generating 12M+ rows a year in `messages`, `conversation_events`, and `ai_runs` will cause index sizes to exceed RAM limits, tanking query performance. 
*   **Fix:** Implement PostgreSQL Native Table Partitioning (by Month) on `messages`, `conversation_events`, and `ai_runs` using the `created_at` column. This keeps active indexes hot in RAM and makes archival (dropping old partitions) instantaneous.

**2. Missing Covering Indexes for the Inbox**
*   **The Risk:** The most hammered query in the entire system is the Agent Inbox. Filtering the `conversations` table by agent, status, and sorting by time without a dedicated index will cause full table scans.
*   **Fix:** `CREATE INDEX idx_conversations_inbox ON conversations (organization_id, assigned_agent_id, status, last_message_at DESC);`

**3. Round-Robin Cursor Contention**
*   **The Risk:** `campaigns.rr_cursor` is a single integer. During a Meta ad spike, 50 concurrent webhooks attempting to `UPDATE campaigns SET rr_cursor = rr_cursor + 1` will cause severe row-level lock contention and deadlocks.
*   **Fix:** Move the cursor out of the core `campaigns` table into a lightweight `campaign_cursors` table, or use Redis/Memcached with an atomic `INCR` to manage the cursor, reconciling asynchronously.

---

## P2: Medium Risks (Operations & Reporting)

**1. Missing `updated_at` on `messages`**
*   **The Risk:** The design states `messages` has no `updated_at` column, and WhatsApp status updates (sent -> delivered -> read) simply overwrite the `status`. This breaks Change Data Capture (CDC) pipelines, making it impossible to stream status changes to a data warehouse for analytics.
*   **Fix:** Add `updated_at` and trigger it on `status` changes.

**2. pgvector Indexing Sub-optimal**
*   **The Risk:** The design notes mention `ivfflat` for `idx_chunks_embedding`. `ivfflat` is obsolete and suffers from poor recall and build times compared to modern algorithms.
*   **Fix:** Use `hnsw` (Hierarchical Navigable Small World) for all pgvector indexes. It is significantly faster and more accurate for production RAG workloads.

**3. Reporting Bottlenecks**
*   **The Risk:** Running BI queries (e.g., SLA response times, agent performance) directly against the `conversations` and `messages` tables will degrade operational performance.
*   **Fix:** Implement logical replication to a read-replica for reporting, or use materialized views refreshed nightly.

---

## Recommendations

1. **Transactional Outbox Table:** Create an `outbox_events` table (`id, aggregate_type, aggregate_id, type, payload JSONB, created_at`) in the same schema to guarantee atomic NATS publishing alongside message inserts.
2. **Schema Migration Discipline:** The note about *"editing early files rather than appending"* is a massive red flag. Enforce strict immutable migrations (e.g., using `golang-migrate` or `Goose`). Never mutate a committed migration script.
3. **Connection Pooling:** At 1000+ concurrent agents and multiple microservices/workers, PostgreSQL connections will exhaust. Mandate `PgBouncer` running in transaction-pooling mode in front of the DB.

---

## Final Score

* **Multi-Tenant Isolation:** 9/10 *(Excellent rigorous use of `organization_id` on all domain tables).*
* **Data Integrity:** 5/10 *(Missing core idempotency constraint; dangerous cascade deletes).*
* **Query Performance:** 6/10 *(Missing critical covering indexes for the hot path).*
* **Scalability (1M+ msgs/mo):** 4/10 *(Will suffer from MVCC bloat and lacks table partitioning).*
* **Overall Database Readiness:** 6/10

**Verdict:** The baseline schema is well-thought-out functionally, but structurally unprepared for the write-heavy throughput of an enterprise omnichannel platform. Applying partitioning, fixing the MVCC bloat risks, and replacing cascading deletes with soft-deletes will make this schema bulletproof.
