# 05 — User Flows

End-to-end flows, traced against the real services. `→` = event/call hop.

## Flow A — CTWA lead lands, gets attributed, assigned, qualified

```
Customer taps CTWA ad → WhatsApp → Meta Cloud API
  → POST /webhook/whatsapp (gateway)
  → gateway ACKs 200 fast, publishes events.message.received (NATS)
  → messaging.onReceived:
       resolveChannel(phone_number_id)
       upsertContact(org, phone)
       resolve campaign: referral source_id  ∈ campaign.ad_source_ids
                         else keyword in body ∈ campaign.keywords
       getOrCreateThread(campaign)  → routeToCampaign (round-robin assign)
       insertInbound (genuine=false if it's the ad opener)
       enrollSequences
       publish events.message.persisted
  → ai-agent.on_persisted (inbound, contact only):
       classify_and_update  → interest level + stage + disposition
       llm.generate (extraction only) → car_brand/model/city/timeframe/lost_reason
  → realtime: message.persisted fan-out → dashboards update live
```
Result: a new campaign-scoped conversation, assigned to the next agent, scored, with
extracted fields — no human action yet.

## Flow B — Agent works the conversation

```
Agent opens /inbox
  → GET /api/conversations         (role-scoped list; agent sees only own)
  → click thread → GET /api/conversations/{id}/messages  (guarded; resets unread)
  → reply → POST /api/conversations/{id}/messages
       → gateway publishes events.message.outbound
       → messaging sends to WA (mock in dev) → persists → status Sent/Delivered/Read
  → agent sets stage via PATCH /api/conversations/{id}  (locks AI classification)
  → "Lost" → dialog pre-filled with AI lost_reason → PATCH lost_reason + stage
  → "Call Customer" (mobile) → WA voice-call deep link + POST .../calls (log attempt)
```

## Flow C — Smart auto follow-up (no human, no AI chat)

```
gateway.runFollowUpCron (every 15 min)
  → SELECT conversations WHERE is_bot_active AND status='open'
       AND last_contact_message_at < now()-4h
       AND (last_agent_message_at IS NULL OR < last_contact_message_at)
       AND followup_count < 3 AND NOT classification_locked
  → followup_count += 1
  → POST ai-agent /followup
       → handle_followup: load history → llm.generate (sales-style follow-up)
       → publish events.message.outbound (sender_type=bot)
       → outbound stamps last_agent_message_at → won't re-fire until customer replies
```

## Flow D — Manager configures a campaign

```
Manager/Admin → /settings/campaigns → "New campaign"
  → name, dealer, ad_source_ids[], keywords[], agents[], routing=round_robin
  → POST /api/campaigns ; agents stored in campaign_agents
From then on, Flow A attributes matching leads to this campaign.
```

## Flow E — Admin manages people & roles

```
Admin → /settings/people (paginated table: role, depts, campaigns, last login)
  → invite: POST /api/users
  → edit:   PATCH /api/users/{id}  (admin may change email + reset password)
  → activate/deactivate, remove
Admin → /settings/roles (permission matrix)
  → toggle menu/action checkboxes per role  → PUT /api/role-permissions
  (stored in org settings; enforcement is a follow-up — see 15/16)
```

## Flow F — Auth & password reset

```
Login: POST /auth/login → argon2id verify → JWT → last_login_at = now()
Forgot: /forgot-password → POST /auth/forgot-password
  → single-use hashed token (1h TTL) emailed via SMTP
    (dev: link logged by gateway when SMTP_HOST unset)
Reset:  /reset-password?token=... → POST /auth/reset-password
  → validate token (unused, unexpired) → set password_hash → invalidate token
```

## Flow G — Realtime updates

```
Any of: message.persisted | conversation.assigned | conversation.closed |
        conversation.handoff
  → realtime (NATS queue group) forwards to Redis rt:events:{org}
  → every realtime instance PSUBSCRIBEs rt:events:* → broadcasts to local
    WebSocket clients of that org
  → web Shell ws handler: play sound + browser notification + invalidate queries
```
