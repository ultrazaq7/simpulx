# Ownership Lifecycle

While the core Lead Lifecycle defines how a lead enters the system, the Ownership Lifecycle governs what happens to the lead *after* initial assignment. The state machine currently lacks definitions for human operational events.

## 1. The Standard Ownership Lifecycle
- **Unassigned:** Lead exists but bypassed round-robin (e.g., no agents in pool). Visible in a global campaign queue.
- **Assigned:** Agent actively owns the lead.
- **Transferred:** Lead ownership changes manually.
- **Orphaned:** Agent is deactivated, lead must be re-homed.

## 2. Agent Resignation & Deactivation
*Scenario: Agent B leaves the company. Their account is deactivated.*
- **Missing State:** The system cannot leave active leads assigned to a deactivated user ID.
- **Production Rule:** Deactivating a user must trigger an asynchronous `bulk_reassign` event.
- **Behavior:** 
  - All `active` leads owned by the deactivated agent are gathered.
  - They are pushed back through the Fair Distribution (Round-Robin) engine to the remaining active agents in the SimpulX Campaign pool.
  - `closed` or `lost` leads remain permanently attributed to the deactivated agent's ID for historical reporting and commission auditing.

## 3. Lead Transfer (Peer-to-Peer)
*Scenario: Agent A is going on vacation or realizes a lead is better suited for Agent B.*
- **Missing State:** Manual transfer capability.
- **Behavior:** Agent A triggers a transfer. Ownership changes to Agent B.
- **Constraint:** Transfers must only be allowed to agents within the *same* SimpulX Campaign.

## 4. Supervisor Reassignment (Force Transfer)
*Scenario: Agent A is underperforming on a high-value lead. Supervisor intervenes.*
- **Missing State:** Override reassignment.
- **Behavior:** Supervisor forces a transfer to Agent C. 
- **AI/Reporting Impact:** The transfer event must tag who initiated the transfer (the supervisor) so Agent A isn't penalized for "losing" the lead, but the SLAs reset for Agent C.
