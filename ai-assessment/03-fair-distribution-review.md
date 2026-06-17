# Fair Distribution Engine Review

## Current Implementation Assessment
The system uses a Postgres CTE and `rr_cursor` increment to distribute leads fairly among a campaign's agents.

```sql
UPDATE conversations
   SET campaign_id=$1, assigned_agent_id = ...
 WHERE id=$2 AND campaign_id IS NULL;
```
Crucially, the code checks `tag.RowsAffected() > 0` before incrementing `rr_cursor`. This is a highly effective, pragmatic invariant that prevents skipped agents during re-routing attempts.

## Failure Scenarios & Concurrency Risks

1. **The Double-Webhook Race Condition:**
   If WhatsApp delivers two webhooks for the *same* new contact simultaneously, NATS might trigger two `events.message.received` consumers in parallel.
   - Both consumers fail to find an existing conversation.
   - Both create a new conversation.
   - Result: Duplicated leads in the UI, breaking the "one lead instance per campaign" rule.
   - **Mitigation:** The DB must enforce a `UNIQUE(contact_id, campaign_id)` constraint where `status != 'closed'`. The second insert will fail, and the application must catch the conflict and route to the newly created row.

2. **The "Agent Goes Offline" Blackhole:**
   - The current engine is "pure round-robin" and does not check if an agent is online or on shift.
   - If a lead is assigned to Agent Dua at 2 AM, it sits unread until 9 AM.
   - **Mitigation:** Implement `campaigns.routing_strategy = 'round_robin_online_only'` leveraging the WebSocket presence state, or build an SLA timeout (e.g., if unread for 15 minutes, send supervisor alert).

3. **No Agents Available:**
   - `GREATEST(count,1)` safely handles the 0-agent scenario by leaving `assigned_agent_id` null. 
   - **Risk:** Leads sit in the unassigned queue indefinitely.
   - **Mitigation:** Ensure the Manager/Admin dashboard has clear visibility and alerts for unassigned leads, preventing them from falling through the cracks.

## Conclusion
The core SQL logic is solid and avoids complex distributed locking. The primary risks lie in high-concurrency webhook arrivals and operational edge cases (offline agents). Do not move this to Kafka or a complex distributed saga; a simple database unique constraint and UPSERT logic is sufficient.
