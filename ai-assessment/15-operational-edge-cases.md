# Operational Edge Cases

The production state machine must account for real-time race conditions and operational SLA failures.

## 1. Concurrency & Race Conditions

**The "Claim Unassigned" Race Condition:**
*Scenario: A lead sits in the Unassigned queue. Agent A and Agent B both click "Claim" at the exact same millisecond.*
- **Missing Protection:** If the backend simply runs `UPDATE conversations SET assigned_agent_id = $1 WHERE id = $2`, the last query to execute wins, and the first agent's UI will lie to them.
- **Production Rule:** The query must strictly be:
  `UPDATE conversations SET assigned_agent_id = $1 WHERE id = $2 AND assigned_agent_id IS NULL;`
- **Behavior:** If `RowsAffected() == 0`, return an HTTP 409 Conflict. The UI alerts the agent: "Another agent has already claimed this lead."

**The Round-Robin vs. Manual Claim Race:**
*Scenario: The Round-Robin engine is taking 500ms to assign a lead. An admin manually claims it in the UI before the engine finishes.*
- **Production Rule:** The Round-Robin CTE must also verify `assigned_agent_id IS NULL` before updating, failing gracefully if a human intervened.

## 2. SLA Escalation Rules

**First Response SLA:**
*Scenario: An agent receives a new lead but doesn't reply within 15 minutes.*
- **Missing State:** The lead is "assigned" but "unhandled."
- **Production Rule:** A background worker monitors `last_agent_message_at` against the lead `created_at`.
- **Behavior:**
  - **Level 1 (15m):** UI Warning / NATS event to trigger push notification.
  - **Level 2 (30m):** Escalate to Supervisor dashboard.
  - **Level 3 (60m):** Escalate to Missed SLA Report. The supervisor is notified of a critical SLA breach for manual intervention.

**Resolution SLA (Stale Leads):**
*Scenario: Lead is active, but the agent hasn't followed up in 3 days.*
- **Behavior:** The AI Copilot 4h-cron currently drafts a message. If the agent ignores the draft for 72 hours, the system should auto-transition the lead status to `dormant` or alert the supervisor of a "Stale Active Lead."
