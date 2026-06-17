# Prioritized Improvements

The following improvements are stacked by ROI and critical path to production. Do not rewrite the architecture; execute these surgical fixes.

## Phase 1: Launch Blockers (P0)
These must be fixed before any production traffic hits v2.

1. **Commit and CI/CD:** Track the `v2` directory in Git. Setup a GitHub Actions (or equivalent) pipeline for building the Go binaries and Next.js frontend.
2. **Automate Migrations:** Stop manual SQL execution. Integrate `golang-migrate` or Goose into the startup sequence of the backend services.
3. **Secure WebSockets:** Replace the `?org=` query parameter in `realtime` with strict JWT validation. If the token is invalid, drop the connection.
4. **Database Unique Constraints:** Add the `UNIQUE(contact_id, campaign_id)` constraint (filtered by active status) to the conversations table to prevent double-webhook race conditions.

## Phase 2: Operational Stability (P1)
These ensure the system doesn't break under real-world sales team usage.

1. **WhatsApp Context TTL:** Implement a 24-48 hour timeout on the "latest active lead instance" check. Stale threads should not blindly capture new generic messages.
2. **Decoupled AI Cron:** Refactor the 4-hour follow-up generator. The cron should only identify targets and push them to NATS. A separate worker should handle the Anthropic API calls with exponential backoff.
3. **Offline Agent Handling:** Adjust the Fair Distribution Engine to either skip agents without an active WebSocket connection, or implement a 15-minute SLA timeout that re-routes unread messages.

## Phase 3: Value Add & AI (P2)
These create business value once the core is stable.

1. **Agent Assist (Suggested Replies):** Swap the "local hashing" embeddings for OpenAI embeddings. Expose a WebSocket event that pushes 3 suggested replies based on KB RAG to the agent's UI when a customer message arrives.
2. **SLA Dashboard:** Build the UI to surface the timestamps already being captured (`last_agent_message_at`, `lead_count`).
3. **One-Click CRM Sync:** Map the fields extracted by the LLM (`car_brand`, `city`, etc.) to the frontend UI so agents can approve them into the official record rather than re-typing them.
