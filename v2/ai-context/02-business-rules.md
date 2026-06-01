# 02 — Business Rules

> The invariants that make Simpulx correct. Many are non-obvious and were decided with
> the customer (OTO). Violating these is a bug even if the code "works".

## Tenancy & identity

- **BR-1** Every row is scoped to an `organization_id` (tenant). All queries filter by
  the caller's org from their JWT. Cross-org access is impossible by construction.
- **BR-2** A **contact** is unique per `(organization_id, phone)` for WhatsApp, or per
  `external_ids.psid` for Meta (Messenger/Instagram) contacts who have no phone.

## Campaigns & the shared number

- **BR-3** OTO operates **one shared WhatsApp number** for OTO 1. Dealers do **not** get
  their own number — they get **campaigns** on the shared number. The "Simpulx number"
  itself is the **Testing** channel.
- **BR-4** "**Campaign**" is a reserved domain term meaning a dealer's lead-routing unit
  (dealer + attribution rules + agents + round-robin). It is **NOT** a broadcast/blast.
  Never conflate the two in UI copy or code.
- **BR-5** Dealers **pay for campaigns**. Credits, routing, and round-robin live at the
  **campaign** level, not the org or channel level.
- **BR-6** A campaign owns: a dealer name, attribution rules (`ad_source_ids[]`,
  `keywords[]`), a set of agents (`campaign_agents`), and a `routing_strategy`
  (default `round_robin`).

## Lead attribution & multi-thread

- **BR-7** Inbound attribution priority: **(1) CTWA ad referral** (`source_id` ∈ a
  campaign's `ad_source_ids`) → **(2) keyword match** (message body contains a campaign
  `keyword`) → **(3) none** (continue the contact's latest open thread).
- **BR-8** **Multi-thread:** one contact may hold **multiple parallel conversations, one
  per campaign**. A message that resolves to campaign B must open/continue a conversation
  in campaign B — it must **not** bleed into the contact's existing campaign-A thread.
- **BR-9** When a campaign-resolved message arrives and the contact has an **untagged**
  open thread, adopt that thread into the campaign rather than splitting a new one.
- **BR-10** The **CTWA ad opener** (the first templated inbound carrying a referral) is
  marked `genuine = false`; the lead classifier ignores non-genuine messages so every ad
  lead is not biased toward "interested".

## Fair distribution (round-robin)

- **BR-11** A new campaign thread is assigned to the next agent via round-robin over
  `campaign_agents` ordered by `user_id`, using the campaign's `rr_cursor`.
- **BR-12** `rr_cursor` and `lead_count` only advance when a conversation is **actually**
  routed (the assigning UPDATE affected a row). They must not advance for an
  already-attributed conversation, or agents get skipped. See [14-fair-distribution-engine.md](14-fair-distribution-engine.md).

## Qualification & scoring

- **BR-13** **Interest level** (`hot|warm|cold`) is the SCORE axis. It is set by the
  rules classifier from the customer's *genuine* messages, never by stage.
- **BR-14** **Pipeline stage** is the action/milestone funnel:
  `New Lead → Contacted → Qualified → Appointment → Test Drive → SPK (won) → Delivered (won)`.
  Stage and interest level are independent axes.
- **BR-15** A human override of stage/disposition sets `classification_locked = true`;
  the AI must never overwrite a human-locked classification.
- **BR-16** **Lost reason** is AI-detected when a lead goes cold/declines, and is
  pre-filled into the manual "Lost" dialog so a rep edits rather than retypes. Reps may
  override it.

## AI behavior

- **BR-17** The AI **never auto-replies** to customers. On inbound it (a) runs the rules
  classifier and (b) extracts structured fields (brand/model/city/timeframe/lost_reason).
- **BR-18** **Smart follow-up** fires only when: customer messaged last AND it has been
  quiet ≥ 4h AND no rep/bot has replied since (`last_agent_message_at` < `last_contact_message_at`)
  AND `followup_count < 3` AND the conversation is not classification-locked.
- **BR-19** The knowledge base does not auto-learn. `knowledge_chunks` is written only by
  explicit ingest. Curated facts are distilled from historical agent replies, never from
  customer questions. See [15-ai-engine.md](15-ai-engine.md).

## Conversation visibility (RBAC)

- **BR-20** **agent** sees only conversations assigned to them. **manager** sees
  conversations in campaigns they belong to plus unassigned. **admin/owner** see all.
  Enforced on both the list and every per-conversation endpoint (no IDOR). Unauthorized
  access returns 404, never 403 (no existence leak). See [16-security.md](16-security.md).

## Channels & WhatsApp window

- **BR-21** WhatsApp's 24-hour customer-care window: free-form messages allowed only
  within 24h of the last inbound (`window_expires_at`). Outside it, only approved
  template (HSM) messages may be sent.
- **BR-22** Message lifecycle states: `Sent → Delivered → Read → Replied`.

## Call tracking

- **BR-23** "Call Customer" is a **WhatsApp voice-call redirect** (deep link to the WA
  call on the rep's phone), not a PSTN/CallLog call. The system logs **attempts** (button
  taps) to the conversation; WA-call duration cannot be captured from outside WhatsApp.

## UI copy

- **BR-24** UI is **English by default**. **Never use an em dash** in UI copy.
