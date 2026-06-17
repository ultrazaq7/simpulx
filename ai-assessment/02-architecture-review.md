# Architecture Review

## Technology Stack Validation
Based on repository inspection, the actual technology stack is:
- **Backend:** Go 1.22
- **Database:** PostgreSQL (via `pgx/v5`)
- **Messaging/Events:** NATS (`nats.go`)
- **Cache/State:** Redis (`go-redis/v9`)
- **Storage:** MinIO
- **Web Frontend:** Next.js 14, React 18, Zustand, React Query, Material UI
- **AI Service:** Python, Anthropic (Claude), PgVector

**Verdict:** The stack is highly appropriate. Go provides low latency and high concurrency for messaging. NATS is an excellent choice for distributed event routing. Next.js + React Query + Zustand is a modern, predictable frontend standard.

## Backend Architecture
The backend is structured into distinct domains (`gateway`, `messaging`, `realtime`, `conversation`, `broadcasts`, `ai-agent`).

**Strengths:**
- **Go 1.22 Routing:** Leveraging native HTTP routing prevents heavy framework bloat.
- **Event-Driven:** Using NATS for `events.message.received` ensures the gateway isn't bottlenecked by heavy processing (e.g., AI extraction).
- **Direct SQL:** Using `pgx` directly instead of a heavy ORM prevents N+1 query issues and allows for fine-tuned queries (like the round-robin CTE).

**Risks & Missing Pieces:**
- **Realtime Security:** The WebSocket connection uses `?org=` in the query string. This must be migrated to JWT validation immediately to prevent cross-tenant data leaks.
- **Manual Migrations:** The `db/migrations` exist but are not applied automatically. This will cause deployment drift.
- **Error Handling & Observability:** Need to ensure all NATS event failures have dead-letter queues (DLQ) or retry mechanisms. If the `ai-agent` fails to extract fields, does it drop the message silently?

## Frontend Architecture
**Strengths:**
- **State Management:** Using Zustand for global UI state and React Query for server state is exactly correct. It prevents prop drilling while handling caching and re-validation automatically.
- **UI Framework:** Material UI provides a strong enterprise baseline.

**Risks:**
- **IDE vs Compiler Drift:** The documentation notes that the IDE emits stale JSX diagnostics. This implies a potential TS config mismatch or aggressive caching.
- **WebSocket Reconnection:** If the NATS/WebSocket layer drops, the frontend must gracefully reconnect and fetch missing events to prevent lost messages.

## Database Access Patterns
- Using raw `pgx` with SQL parameters is secure against SQL injection.
- The use of `JSONB` for flexible settings is appropriate for multi-tenant configurations.

## Authentication
- **Mechanism:** `argon2id` + JWT.
- **Verdict:** Secure and industry-standard. However, the system relies on `last_login_at` applied manually. Ensure password reset tokens are aggressively expired (e.g., 15 minutes) and that all routes strictly enforce RBAC, not just the UI.
