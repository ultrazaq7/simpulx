# Implementation Plan: SimpulX v2 Production Readiness

This plan sequences the required architectural fixes to minimize risk and refactoring while maximizing delivery speed.

---

## Phase 1 (Foundation)
*Focus: Security, Tenant Isolation, and Deployment Hygiene.*

### 1.1 WebSocket JWT Authentication
*   **Prerequisites:** None
*   **Dependencies:** Authentication Service
*   **Database Changes:** None
*   **Backend Changes:** Modify `realtime` service upgrade HTTP handler. Parse and validate JWT instead of `?org=` query param. Reject invalid tokens with HTTP 401.
*   **Frontend Changes:** Update WebSocket connection utility to pass JWT in headers or protocols.
*   **WebSocket Changes:** Standardize disconnect/reconnect flows on token expiry.
*   **NATS Changes:** None
*   **AI Changes:** None
*   **Complexity:** S
*   **Risk:** Low

### 1.2 Tenant Isolation & DB Migrations CI
*   **Prerequisites:** None
*   **Dependencies:** GitHub/GitLab
*   **Database Changes:** Add `organization_id` to `conversations`, `messages` (if missing). Add `FOREIGN KEY` constraints. Apply via automated migration tool (e.g., `golang-migrate`).
*   **Backend Changes:** Ensure all queries globally append `AND organization_id = $1`.
*   **Frontend Changes:** None
*   **WebSocket Changes:** None
*   **NATS Changes:** Scope subjects to `org.<org_id>.*`.
*   **AI Changes:** None
*   **Complexity:** M
*   **Risk:** Medium

---

## Phase 2 (Core Messaging)
*Focus: Message Reliability and Idempotency.*

### 2.1 Transactional Outbox Pattern
*   **Prerequisites:** 1.2 Tenant Isolation
*   **Dependencies:** None
*   **Database Changes:** Create `outbox_events` table (id, payload, topic, status).
*   **Backend Changes:** Modify `gateway` message ingest. Open DB Tx -> Insert Message -> Insert Outbox -> Commit. Background worker polls/tails Outbox and publishes to NATS.
*   **Frontend Changes:** None
*   **WebSocket Changes:** None
*   **NATS Changes:** Gateway stops publishing directly to NATS during HTTP requests.
*   **AI Changes:** None
*   **Complexity:** L
*   **Risk:** High

### 2.2 Idempotency & Webhook Protection
*   **Prerequisites:** None
*   **Dependencies:** Redis
*   **Database Changes:** Add `UNIQUE(provider_message_id, organization_id)` to `messages` table.
*   **Backend Changes:** Add 10-second `SETNX` Redis debounce lock on `wamid` in gateway. Handle DB unique constraint violations gracefully (HTTP 200).
*   **Frontend Changes:** None
*   **WebSocket Changes:** None
*   **NATS Changes:** Ensure consumer UPSERTs are fully idempotent on JetStream redelivery.
*   **AI Changes:** None
*   **Complexity:** S
*   **Risk:** Medium

---

## Phase 3 (Lead Lifecycle)
*Focus: Multi-touch Tracking and State Transitions.*

### 3.1 Multi-Touch Attribution Schema
*   **Prerequisites:** None
*   **Dependencies:** None
*   **Database Changes:** Create `conversation_attributions` table (`conversation_id`, `meta_campaign_id`, `created_at`) with `ON DELETE RESTRICT`. Remove unique assumption on `conversations.referral_source_id`.
*   **Backend Changes:** Modify `events.message.received` logic to INSERT to attribution table upon inbound ad click.
*   **Frontend Changes:** UI timeline to display attribution events.
*   **WebSocket Changes:** Broadcast attribution appended events.
*   **NATS Changes:** New payload schema for `events.message.received` including `meta_campaign_id`.
*   **AI Changes:** None
*   **Complexity:** M
*   **Risk:** Medium

### 3.2 Lead Re-entry & Disambiguation Routing
*   **Prerequisites:** 3.1 Attribution Schema
*   **Dependencies:** None
*   **Database Changes:** Add `UNIQUE(contact_id, simpulx_campaign_id)` WHERE `status != 'closed'`.
*   **Backend Changes:** 
    *   Implement "Closed/Lost" -> Create New Instance logic.
    *   Implement 30-day "Dormant" Bot Prompt for ambiguous plain text messages.
*   **Frontend Changes:** Prevent manual "Reopen" if active lead exists.
*   **WebSocket Changes:** None
*   **NATS Changes:** None
*   **AI Changes:** None
*   **Complexity:** L
*   **Risk:** High

---

## Phase 4 (Fair Distribution)
*Focus: Routing Hygiene and Edge Cases.*

### 4.1 Round-Robin Bypass & Concurrency Locks
*   **Prerequisites:** 3.2 Lead Re-entry
*   **Dependencies:** None
*   **Database Changes:** None
*   **Backend Changes:** 
    *   Add hard-guard to bypass Round-Robin CTE if `assigned_agent_id IS NOT NULL`.
    *   Use `SELECT ... FOR UPDATE` when transitioning lead states.
*   **Frontend Changes:** None
*   **WebSocket Changes:** None
*   **NATS Changes:** None
*   **AI Changes:** None
*   **Complexity:** M
*   **Risk:** High

### 4.2 Ownership Lifecycle & Agent Deactivation
*   **Prerequisites:** None
*   **Dependencies:** None
*   **Database Changes:** None
*   **Backend Changes:** 
    *   Implement `bulk_reassign` logic on user deactivation.
    *   Implement SLA timers (15m, 30m, 60m escalation reports).
*   **Frontend Changes:** Display SLA warnings in UI.
*   **WebSocket Changes:** Emit `cmd.websocket.disconnect` upon user deactivation/transfer.
*   **NATS Changes:** New event `events.agent.deactivated`.
*   **AI Changes:** None
*   **Complexity:** L
*   **Risk:** Medium

---

## Phase 5 (AI Copilot)
*Focus: Cost Controls and Decoupling.*

### 5.1 Asynchronous Worker & DLQ
*   **Prerequisites:** None
*   **Dependencies:** None
*   **Database Changes:** None
*   **Backend Changes:** Remove 4h cron from Gateway. Move to background worker.
*   **Frontend Changes:** None
*   **WebSocket Changes:** None
*   **NATS Changes:** Publish `cmd.ai.draft_followup`. Implement Dead Letter Queue. Tune `AckWait` to 30s.
*   **AI Changes:** None
*   **Complexity:** M
*   **Risk:** Low

### 5.2 Event Debouncing & Intent Upgrade
*   **Prerequisites:** 3.1 Multi-Touch Schema
*   **Dependencies:** Redis
*   **Database Changes:** None
*   **Backend Changes:** Implement 5-10s Redis delay/debounce before publishing message events to AI worker.
*   **Frontend Changes:** None
*   **WebSocket Changes:** None
*   **NATS Changes:** None
*   **AI Changes:** Update Python Rules Classifier to upgrade `interest_level` when multi-touch records are detected.
*   **Complexity:** M
*   **Risk:** Low

---

## Phase 6 (Production Hardening)
*Focus: Auditing and Performance.*

### 6.1 Audit Trail Event Sourcing
*   **Prerequisites:** 2.1 Outbox Pattern
*   **Dependencies:** None
*   **Database Changes:** Create `conversation_events` table (actor, type, old_state, new_state).
*   **Backend Changes:** Insert audit records alongside every state mutation (assignments, status changes).
*   **Frontend Changes:** Render system events in chat timeline.
*   **WebSocket Changes:** Broadcast audit events to UI.
*   **NATS Changes:** None
*   **AI Changes:** None
*   **Complexity:** M
*   **Risk:** Low

### 6.2 Indexes and Archival Strategy
*   **Prerequisites:** None
*   **Dependencies:** None
*   **Database Changes:** 
    *   Add missing indexes (`campaign_agents`, SLA lookup, Active Lead lookup).
    *   Implement Postgres Table Partitioning by month for `messages`.
*   **Backend Changes:** None
*   **Frontend Changes:** None
*   **WebSocket Changes:** None
*   **NATS Changes:** None
*   **AI Changes:** None
*   **Complexity:** L
*   **Risk:** Medium
