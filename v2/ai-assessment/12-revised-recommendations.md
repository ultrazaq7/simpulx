# Revised Recommendations

Based on the corrected business model (SimpulX Campaign > Meta Campaigns), here is the updated, prioritized execution plan.

## Phase 1: Launch Blockers & Data Integrity (P0)

1. **Implement Multi-Touch Attribution Tracking:**
   - Modify the database schema. Remove the assumption of a single `referral_source_id` on the conversation row if it exists.
   - Create a mechanism (e.g., `conversation_attributions` table) to append attribution events: `(conversation_id, meta_campaign_id, clicked_at)`.
   - When a known lead interacts via a *new* Meta Campaign ad, append a record here instead of creating a new lead.

2. **Hard-Code the Round-Robin Bypass:**
   - Review the `events.message.received` NATS consumer.
   - Add a strict guard: If an active conversation exists for `(contact_id, simpulx_campaign_id)`, immediately route the message to the existing `assigned_agent_id`.
   - Ensure the CTE that increments `rr_cursor` is mathematically impossible to reach for existing leads.

3. **Secure WebSockets & CI/CD:**
   - *(Valid from previous review)* Fix the `?org=` query parameter IDOR vulnerability using JWT auth.
   - Establish Git tracking and automated DB migrations.

4. **SimpulX Campaign Unique Constraint:**
   - Apply `UNIQUE(contact_id, simpulx_campaign_id)` where `status != 'closed'` in PostgreSQL to prevent high-concurrency double-webhook race conditions from creating duplicate lead instances.

## Phase 2: Routing Hygiene & AI Rules (P1)

1. **Multi-Touch AI Intent Upgrade:**
   - Update the Python AI Rules Classifier. If the system detects a message arriving from a *second* (or third) distinct Meta Campaign, automatically bump the `interest_level` to `high_intent`. Multi-ad engagement is a massive buying signal.

2. **Cross-SimpulX Campaign Context TTL:**
   - Because one contact can exist in *multiple* SimpulX Campaigns (e.g., Honda Jakarta and Toyota Jakarta), an ambiguous plain-text message has high risk of cross-contamination.
   - Implement a strict 24-48 hour TTL on "active" status. If a customer replies "Halo" after 3 days, trigger the Bot Prompt to clarify their intent rather than guessing which SimpulX Campaign they meant.

## Phase 3: Agent Value Add (P2)
*(Unchanged from previous review)*
- Move the 4h follow-up AI generator to a background worker to prevent Gateway bottlenecks.
- Introduce RAG-based Agent Assist (suggested replies) in the UI. 
- Map LLM-extracted fields (`car_brand`, `city`) to one-click UI forms.
