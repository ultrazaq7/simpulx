# Ownership Policy Correction

## Critical Business Rule Correction
Lead ownership within SimpulX is **strictly sticky and human-controlled**. 

All automated unassignment, auto-transfer, and automated reassignment behaviors have been completely stripped from the architecture design. 

## The Ownership Principle
Once a lead is assigned to an agent via the initial Fair Distribution (Round-Robin) process, or manually by a supervisor:
- **Ownership remains permanently with that agent** (unless human intervention occurs).
- Ownership **cannot** be removed automatically by SLA timeouts.
- Ownership **cannot** be transferred automatically based on inactivity.
- Ownership **cannot** be redistributed automatically if an agent goes offline.

## Allowed Automated Actions
The system is permitted to observe, report, and escalate, but never mutate ownership without human intent. The SLA worker may *only* perform the following automated actions:
- Send SLA reminders (UI warnings, push notifications).
- Send supervisor alerts.
- Generate escalation reports (e.g., "Missed SLA Report").

## Exclusive Ownership Modification Events
The database `UPDATE conversations SET assigned_agent_id = ...` query may **only** be triggered by the following events:
1. **Initial Assignment:** Round-Robin engine (when `assigned_agent_id IS NULL`).
2. **Supervisor Manual Transfer:** A manager actively clicks to force-transfer a lead.
3. **Explicit Admin Reassignment:** System administrators performing data corrections.
4. **Agent Deactivation/Termination:** An admin deactivates an agent's account, triggering a `bulk_reassign` event to re-home their active leads to the remaining pool.

## Document Remediation Summary
The following documents have been retroactively patched to remove illegal automation:
- **03-fair-distribution-review.md:** Removed 15-minute SLA timeout auto-reassign; replaced with "supervisor alert."
- **12-operational-edge-cases.md:** Removed 60-minute Level 3 Auto-Unassign; replaced with "Escalate to Missed SLA Report."
- **14-audit-trail-design.md:** Removed `SLA Auto-Unassign` audit trigger; replaced with `SLA Breached` escalation event.
- **15-production-readiness-review.md:** Removed "Agent Neglect requires reassignment"; replaced with "requires escalation report."
- **16-final-architecture-gaps.md:** Fixed concurrent SLA worker race condition to reference "escalation report" instead of "auto-unassign".
- **01-implementation-plan.md:** Removed auto-unassign from Phase 4 implementation steps.
