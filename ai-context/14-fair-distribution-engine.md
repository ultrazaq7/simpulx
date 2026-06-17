# 14 — Fair Distribution Engine

How inbound leads are attributed to a campaign and fairly split across that campaign's
agents. This is core IP and a frequent source of subtle bugs. Source:
`services/messaging/store.go` + `main.go`.

## Goals

1. Every lead is attributed to the **campaign** (dealer) that paid for it.
2. Leads are split **fairly** (round-robin) across the campaign's agents.
3. A contact may have **parallel conversations across campaigns** without bleed (BR-8).

## The mental model: "Lead Instance"

A **conversation IS a Lead Instance**: the row is keyed by
`(contact_id, campaign_id, assigned_agent_id)`. One contact (phone) can hold several
parallel lead instances — one per campaign — and an agent on campaign 1 must never see
the contact's campaign-2 instance (enforced by RBAC, BR-20). The boundary is the
campaign-scoped conversation, never the bare contact.

```
Contact (08123…)
├── Lead Instance A → Campaign 1 (Honda) → Agent 2 → Conversation A
└── Lead Instance B → Campaign 2 (Toyota) → Agent 5 → Conversation B
```

> WhatsApp reality: a shared business number gives ONE WA thread per (customer ↔ business)
> and only the FIRST CTWA message carries a campaign referral. Later plain replies carry
> no campaign tag, so a plain message is inherently ambiguous between a contact's lead
> instances. The system must choose deterministically (below).

## Step 1 — Attribution (resolve campaign FIRST)

On `events.message.received`, messaging resolves the campaign **before** choosing a
conversation:

```
campaign, ok = resolveCampaignByReferral(org, referral_source_id)   # CTWA ad
if !ok:
    campaign, ok = resolveCampaignByKeyword(org, message_body)      # keyword in body
```
- **Referral:** `source_id ∈ campaigns.ad_source_ids` (active campaigns).
- **Keyword:** message body contains any `campaigns.keywords` entry (case-insensitive).
- No match → see Step 2b.

Resolving first is what prevents a campaign-B message from landing in the contact's
campaign-A thread (BR-8).

## Step 2b — No campaign signal (the ambiguous case)

A plain message (no referral, no keyword) routes via `getOrCreateConversation`:

- **Existing contact (decision #1):** attach to the contact's **latest active lead
  instance** (`ORDER BY last_message_at DESC`, status ≠ closed). Deterministic; follows
  the customer's most recent topic; never leaks across campaigns.
- **Brand-new contact (decision #2):** create a fresh **unassigned, no-campaign**
  conversation (manager/admin queue — agents don't see un-attributable leads), and send a
  one-time bot prompt: *"Halo! Boleh tahu mobil apa yang Anda minati? Misalnya: {active
  campaign keywords}…"*. `getOrCreateConversation` returns a `created` flag so the prompt
  fires **only** on creation (never re-prompts on later plain replies). When the lead
  replies with a keyword, Step 2 adopts that same conversation into the campaign and
  round-robin assigns an agent (no new thread split).

Verified flow: `"halo pagi"` (new) → unassigned + prompt once → `"tesdong"` → adopted into
Test Campaign 2 + Agent Dua → `"oke siap"` (plain) → stays in the same instance, no
re-prompt, 1 conversation total.

## Step 2 — Conversation selection (multi-thread)

`getOrCreateThread(campaign)`:
1. Reuse an open conversation already tagged with **this** campaign, else
2. **Adopt** an open conversation that has **no campaign yet** (e.g. a generic opener that
   arrived before any keyword) — tag it into this campaign (BR-9), else
3. Create a fresh conversation for this campaign.

No campaign match → `getOrCreateConversation` (latest open thread).

## Step 3 — Round-robin assignment

`routeToCampaign(campaignID, convID)`:
```go
tx, _ := s.pool.Begin(ctx)
var currAgent *string
_ = tx.QueryRow(ctx, `SELECT assigned_agent_id FROM conversations WHERE id = $1 FOR UPDATE`, convID).Scan(&currAgent)

// Round-Robin Bypass: if already assigned, tag campaign only, NO cursor increment.
if currAgent != nil {
    _, _ = tx.Exec(ctx, `UPDATE conversations SET campaign_id = $1...`, campaignID)
    _ = tx.Commit(ctx)
    return
}

// Concurrency lock on campaign cursor
var cursor int
_ = tx.QueryRow(ctx, `SELECT rr_cursor FROM campaigns WHERE id = $1 FOR UPDATE`, campaignID).Scan(&cursor)

var assignedAgent string
_ = tx.QueryRow(ctx,
    `WITH agents AS (SELECT user_id FROM campaign_agents WHERE campaign_id=$1 ORDER BY user_id)
     SELECT user_id FROM agents OFFSET ($2 % GREATEST((SELECT count(*) FROM agents), 1)) LIMIT 1`,
    campaignID, cursor).Scan(&assignedAgent)

tag, _ := tx.Exec(ctx, `UPDATE conversations SET campaign_id=$1, assigned_agent_id=$2...`, campaignID, assignedAgent)
if tag.RowsAffected() > 0 {
    _, _ = tx.Exec(ctx, `UPDATE campaigns SET rr_cursor=rr_cursor+1...`, campaignID)
}
tx.Commit(ctx)
```

### The critical invariant (BR-12)

The cursor/lead-count bump runs **only when the UPDATE affected a row**
(`tag.RowsAffected() > 0`), and is **hard-bypassed** if `assigned_agent_id` is already populated. 
Without this guard, re-attribution attempts on an already-assigned conversation would still advance `rr_cursor`, **skipping agents** and breaking fairness.
Additionally, `SELECT ... FOR UPDATE` row locks are applied on both the conversation and the campaign to prevent race conditions during concurrent incoming webhooks.

- Agents are ordered deterministically by `user_id` so the cursor is stable.
- `GREATEST(count,1)` avoids divide-by-zero when a campaign has no agents (assignment
  becomes a no-op, conversation stays unassigned → visible to managers/admins).

## Verified behavior

- Two campaigns, two agents: a keyword message for campaign B opens a **new** conversation
  assigned to campaign B's agent (Agent Dua), leaving campaign A's thread (Agent Satu)
  untouched; `rr_cursor`/`lead_count` advance only for the routed campaign.

## Edge cases & future work

- **No agents on a campaign:** lead stays unassigned (manager/admin can claim).
- **Manual routing strategy:** `campaigns.routing_strategy` exists; only `round_robin`
  is implemented today.
- **Eligibility & presence (DECIDED 2026-06-17):** an agent is eligible for distribution
  iff `status='active' AND is_deleted=false`. **Presence (`is_online`) intentionally does NOT
  affect distribution** — online/offline is an agent-performance-metric signal (availability /
  online time), not a routing factor. `pickAgent` (the
  department-scoped least-loaded picker) orders by open-chat load, then `last_seen_at` as a
  deterministic tiebreaker; it no longer sorts by `is_online`.
- **Weighting / availability:** future — weight by load (`open_chats`) or shift-based
  availability. (Presence is deliberately out of scope per the rule above.)
- **Agent deactivation / deletion:** deactivating (`status→inactive`) or deleting an agent now
  **auto-unassigns their open leads** (`status ≠ closed → assigned_agent_id = NULL`), writes an
  `unassigned` conversation_event (`reason: agent_deactivated` / `agent_deleted`), and publishes
  `AgentDeactivated` to kick their realtime sessions. Delete is a soft tombstone (see
  [09-database-design](09-database-design.md)).
