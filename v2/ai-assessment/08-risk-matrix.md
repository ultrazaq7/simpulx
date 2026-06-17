# Risk Matrix

| Risk Area | Description | Probability | Impact | Mitigation Strategy |
|---|---|---|---|---|
| **Security (IDOR)** | WebSocket connections trust client-provided `?org=` parameters instead of validating JWTs. | **High** | **Critical** | Enforce JWT validation during the WS upgrade handshake. Reject unauthenticated upgrades. |
| **Data Integrity** | WhatsApp multi-thread routing relies on "latest active lead." Old leads can hijack new ambiguous messages. | **High** | **High** | Implement strict TTLs for active conversations. Force unambiguous bot-prompts for stale threads. |
| **Deployment** | `v2` codebase is untracked in Git and lacks a CI/CD pipeline. Migrations are applied manually. | **High** | **Critical** | Initialize Git tracking immediately. Implement a CI pipeline and automated schema migrations (e.g., `golang-migrate`). |
| **Concurrency** | Double webhook arrivals from WA for new contacts could bypass the unique constraint if handled in app-level memory. | **Medium** | **Medium** | Enforce a composite `UNIQUE(contact_id, campaign_id)` where `status != closed` at the Postgres level. |
| **AI Reliability** | The 4h follow-up cron job runs sequentially in the gateway and will hit Anthropic rate limits. | **High** | **Medium** | Decouple the cron. Have it push task IDs to NATS JetStream, and process via distributed workers with retry logic. |
| **Operations** | Fair distribution is pure round-robin and does not skip offline agents, causing leads to sit unread. | **High** | **Medium** | Implement an SLA timer or check WebSocket presence before assignment. Surface unassigned leads prominently. |
| **Predictive ML** | Attempting to build XGBoost models for lead scoring without a massive, clean historical dataset. | **Low** | **Low** | Stick to the rules-based classifier for the next 12 months to build data maturity. |
