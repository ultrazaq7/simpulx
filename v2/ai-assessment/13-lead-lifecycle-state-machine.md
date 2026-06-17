# Lead Lifecycle & State Machine Design

This document defines the complete lifecycle of a lead within SimpulX v2, accounting for the `Organization > SimpulX Campaign > Agent Pool` hierarchy and the strict separation of Meta Campaigns (attribution) from SimpulX Campaigns (isolated workspaces).

## 1. Core Definitions

- **Contact:** A unique physical person, identified globally across the organization by their WhatsApp Phone Number (e.g., `+62812...`).
- **SimpulX Campaign:** A logical, isolated workspace and agent pool (e.g., "Honda Jakarta", "Toyota Bekasi"). Leads cannot bleed across these.
- **Meta Campaign:** A marketing traffic source (e.g., "HRV FB Ad 1"). Multiple Meta Campaigns map to one SimpulX Campaign.
- **Lead (Conversation):** The fundamental unit of interaction and ownership. It is the unique intersection of a `Contact` and a `SimpulX Campaign` during a specific sales cycle.
- **Attribution:** A discrete record of a Contact clicking a Meta Campaign. A Lead has a `1:Many` relationship with Attributions.
- **Ownership:** The exclusive assignment of a Lead to a single Sales Agent within the SimpulX Campaign's pool.

---

## 2. The State Machine & Scenarios

### Scenario 1: New Lead (Net New to Campaign)
*A Contact clicks a Meta ad mapping to a SimpulX Campaign where they have no prior history, or all previous history is 'Closed/Lost'.*

* **Database:** 
  * Upsert `Contact`.
  * Create new `Conversation` (Lead) row linked to the SimpulX Campaign. Status = `new`.
  * Insert row in `conversation_attributions` with the Meta Campaign ID.
* **Routing:** Execute the Fair Distribution (Round-Robin) CTE against the SimpulX Campaign's agent pool.
* **Ownership:** Assigned exclusively to the selected Agent.
* **AI:** Rules Classifier runs on the initial message, extracts fields (`car_brand`, `city`), and sets initial intent stage.

### Scenario 2: Existing Lead, Same SimpulX Campaign (Multi-Touch)
*An active Lead (already assigned to Agent B) clicks a different Meta Campaign ad belonging to the SAME SimpulX Campaign.*

* **Database:** 
  * DO NOT create a new Lead/Conversation.
  * Insert a new row in `conversation_attributions` linked to the existing Lead.
* **Routing:** Bypass Round-Robin. The message is routed directly to the existing active Conversation ID.
* **Ownership:** Agent B retains exclusive ownership. (No lead stealing).
* **AI:** The Rules Classifier detects the multi-touch attribution event and automatically upgrades the Lead's `interest_level` to `high_intent` (strong buying signal).

### Scenario 3: Existing Lead, Different SimpulX Campaign (Parallel Leads)
*A Contact with an active Lead in "Honda Jakarta" clicks an ad for "Toyota Bekasi".*

* **Database:** 
  * Create a *new* `Conversation` (Lead) row scoped to "Toyota Bekasi".
  * Insert row in `conversation_attributions`.
* **Routing:** Execute Fair Distribution strictly within the "Toyota Bekasi" agent pool.
* **Ownership:** Assigned to an Agent in Toyota Bekasi. (The Contact now has two isolated, parallel Leads owned by different agents in different campaigns).
* **AI:** Analyzed as a completely independent Lead context.

### Scenario 4: Closed Lead Re-entry (Repeat Customer)
*A Lead was marked 'Closed Won'. Six months later, the Contact clicks a new ad for the same SimpulX Campaign.*

* **Database:** 
  * Create a *new* `Conversation` (Lead) row. (Do not reopen the old one, to preserve historical sales metrics and SLA data).
  * Insert row in `conversation_attributions`.
* **Routing:** Bypass Round-Robin. Route to the *Previous Owner* (Relationship Stickiness).
* **Ownership:** Assigned to the original Agent (if they are still active in the pool). If the agent was deactivated, fallback to Round-Robin.
* **AI:** Extract fields, classify as a new sales cycle.

### Scenario 5: Lost Lead Re-entry (Resurrected)
*A Lead was marked 'Lost'. Six months later, the Contact clicks a new ad for the same SimpulX Campaign.*

* **Database:** 
  * Create a *new* `Conversation` (Lead) row. 
  * Insert row in `conversation_attributions`.
* **Routing:** Execute Fair Distribution (Round-Robin). Since the previous agent failed to close, the lead enters the general pool for a fresh attempt.
* **Ownership:** Assigned to a potentially new Agent.
* **AI:** Extract fields, classify as a new sales cycle.

### Scenario 6: Dormant Lead Re-entry (Ambiguous Wakeup)
*An active Lead has had no messages for 45 days. The Contact suddenly sends an ambiguous "Halo" (no ad click, no keyword).*

* **Database:** 
  * Update `updated_at` on the existing Lead. Status transitions from `dormant` back to `active`.
* **Routing:** 
  * **Rule of TTL:** If the lead has been silent for > 30 days, do NOT assume context. Send an automated Bot Prompt: *"Halo! Ada yang bisa kami bantu? Apakah Anda masih tertarik dengan {car_brand}?"*
  * Once the customer confirms, route to the existing assigned Agent.
* **Ownership:** Retained by the existing Agent.
* **AI:** Trigger the Classifier to re-evaluate intent based on their response.

### Scenario 7: Multiple Meta Campaign Attribution
*Covered fundamentally in Scenario 2.*
* **Behavior:** Append-only tracking in `conversation_attributions`. The frontend UI must display a timeline to the agent: *"Customer clicked HRV Ad on Monday, and BRV Ad on Thursday."*

### Scenario 8: WhatsApp Thread Continuity (The Physical Layer constraint)
*Because WhatsApp only provides ONE physical chat thread for the business number, parallel Leads (Scenario 3) exist in the same customer UI.*

* **Behavior:** 
  * When an ad click arrives (`referral_source_id`), routing is deterministic and perfect.
  * When an *ambiguous plain-text message* arrives, the system must query `Active Leads` for that Contact.
  * If the Contact has *only one* active Lead, route to it.
  * If the Contact has *multiple* active Leads across different SimpulX Campaigns (e.g., Honda and Toyota), the system must intercept with a Bot Prompt: *"Halo! Anda sedang terhubung dengan Honda dan Toyota. Pesan ini untuk tim yang mana?"*
  * The message is parked in an unassigned holding state until the intent is clarified, preventing cross-campaign context bleed.

---

## 3. State Machine Diagram (Text Representation)

```text
[Inbound Webhook] -> Extract (Contact, Meta_Campaign, Keyword, Plaintext)

IF Meta_Campaign EXISTS:
    Resolve Meta_Campaign -> SimpulX_Campaign
    Find Active Lead(Contact, SimpulX_Campaign)
    IF Found:
        -> Append Attribution
        -> Route to Existing Owner (Scenario 2)
        -> Upgrade AI Intent
    ELSE:
        Find Closed_Won Lead(Contact, SimpulX_Campaign)
        IF Found:
            -> Create New Lead Instance
            -> Route to Previous Owner (Scenario 4)
        ELSE:
            -> Create New Lead Instance
            -> Route via Round-Robin (Scenario 1 & 5)
            
IF Plaintext (No Meta_Campaign, No Keyword):
    Find ALL Active Leads(Contact)
    IF Count == 1 AND Last_Message < 30_Days:
        -> Route to Existing Owner
    IF Count == 1 AND Last_Message > 30_Days:
        -> Send Re-engagement Bot Prompt (Scenario 6)
    IF Count > 1:
        -> Send Disambiguation Bot Prompt (Scenario 8)
    IF Count == 0:
        -> Send New Lead Bot Prompt (Gather Intent)
```
