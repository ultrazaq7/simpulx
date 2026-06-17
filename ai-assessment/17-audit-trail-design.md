# Audit Trail Design

A CRM processing sales data requires strict non-repudiation. The current state machine defines state transitions but does not define how those transitions are historically tracked.

## Missing Production Scenario: History Tracking
When a lead is lost, transferred, or reassigned by a supervisor, the standard `conversations` table only shows the *current* state. There is no way to answer:
- "Who owned this lead before Agent C?"
- "Did the Supervisor force this transfer, or did Agent A give it up?"
- "How long was it in the 'dormant' state before being resurrected?"

## The `conversation_events` Table

A robust state machine requires an event-sourcing or audit-log pattern for critical mutations. 

**Schema Requirements:**
- `id` (UUID)
- `conversation_id` (UUID)
- `event_type` (Enum: `created`, `assigned`, `transferred`, `status_changed`, `sla_breached`)
- `actor_type` (Enum: `system`, `agent`, `supervisor`, `bot`)
- `actor_id` (Nullable UUID of the person who made the change)
- `previous_state` (JSONB)
- `new_state` (JSONB)
- `created_at` (Timestamp)

## Required Audit Triggers

1. **Routing Assignment:** When Round-Robin assigns a lead. `actor_type = system`.
2. **Status Changes:** When an agent marks a lead `closed` or `lost`. `actor_type = agent`.
3. **Manual Transfers:** When Agent A transfers to Agent B. `previous_state = {agent_id: A}`, `new_state = {agent_id: B}`.
4. **SLA Breached:** When an agent fails to respond in time, generating an escalation report. `actor_type = system`, `event_type = sla_breached`.

## Frontend Integration
The audit trail is not just for debugging; it must be exposed in the UI. When an agent opens a conversation, the chat timeline should intersperse these events alongside messages (e.g., a small gray system bubble: *"Supervisor transferred this lead from Agent A to Agent B at 14:00"*).
