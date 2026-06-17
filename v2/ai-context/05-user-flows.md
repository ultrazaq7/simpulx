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
messaging.runFollowUpCron (every 15 min)
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
        conversation.handoff | export.progress
  → realtime (NATS queue group) forwards to Redis rt:events:{org}
  → every realtime instance PSUBSCRIBEs rt:events:* → broadcasts to local
    WebSocket clients of that org
  → web Shell ws handler: play sound + browser notification + invalidate queries
```

## Flow H — Call Customer (dual-mode)

```
Agent in /inbox, viewing a conversation → clicks 📞 call button (next to attachment)
  → gateway checks channel capabilities (WA Cloud API calling available?)

  Path A — API Call (WA Cloud API calling available):
    → POST /api/conversations/{id}/calls { call_type: 'api' }
    → gateway sends WA Business call request (interactive message)
    → customer receives "Business call request" → Accept / Deny
    → if accepted → VoIP call initiated via WA Cloud API
    → call events logged automatically: started_at, ended_at, duration_sec
    → call_logs entry: call_type='api', status='completed'

  Path B — Manual Call (WA calling not available or fallback):
    → browser opens wa.me/{phone} (mobile) or tel:{phone} (desktop)
    → after call, agent sees dialog: "Log your call" (duration input + notes)
    → POST /api/conversations/{id}/calls { call_type: 'manual', duration_sec, notes }
    → call_logs entry: call_type='manual', status='completed'

Blinking indicator logic (ConversationCard):
  if interest_level='hot' AND total_messages ≥ 3 AND call_attempts = 0
    → phone icon blinks on the card (CSS animation)
    → signal to agent: "this lead is engaged, consider calling"
```

## Flow I — System Logs

```
Manager/Admin → /logs (sidebar: 📋 Logs)
  → tab bar: Messages | Conversations | User Activity | System | Calls
  → each tab → GET /api/logs?category={tab}&from=&to=&page=&limit=
  → paginated table with:
       date range picker, search bar, column sorting
       Messages tab columns:   Direction, Agent, Contact, Message Type, Status,
                                Source URL/ID, Created At
       Conversations tab:      Contact, Agent, 1st RT, Avg RT, Total Msgs,
                                Follow-ups, Calls, Interest, Stage, Campaign
       Calls tab:              Agent, Contact, Call Type (API/Manual), Duration,
                                Status, Notes, Created At
  → click "Export" button →
       POST /api/exports { type: category, filters: { from, to, search } }
       → toast: "Export started. Track progress in Downloads."
```

## Flow J — Downloads (Export tracking)

```
User → /downloads (sidebar: ⬇️ Downloads)
  → GET /api/exports → table of export jobs:
       File name | Exporter | Date | Status | Progress | Size | Actions
  → Status chips:
       Queued (gray) → Processing (blue, animated progress bar) →
       Completed (green, Download button enabled) → Failed (red)
  → real-time: WS event `export.progress` { id, progress, status }
       → progress bar updates live, no polling
  → click Download → GET /api/exports/{id}/download → file stream

Background (gateway/export.go):
  → goroutine picks up 'queued' jobs
  → streams rows to CSV file, updates progress 0→100
  → publishes events.export.progress to NATS → realtime → WS → client
  → on completion: sets file_url, file_size, status='completed'
```

## Flow K — WhatsApp Flows (lead form / booking / survey)

```
Path A — Agent-triggered:
  Agent in /inbox → clicks "Send Form" button (composer) → picks flow template
    → POST /api/conversations/{id}/flows { flow_id }
    → gateway sends WA interactive message (type=flow) to customer
    → customer receives form in WhatsApp → fills fields → submits
    → Meta sends flow response webhook → POST /webhook/whatsapp
    → gateway parses flow_response payload:
         structured data → conversations.custom_fields (merge, don't overwrite)
         auto-set: stage, interest, extracted fields based on answers
         insert message (type='flow_response', body=structured card)
    → publish events.flow.completed (NATS)
    → triggers any automation with trigger_type='flow_response'

Path B — Automation-triggered:
  Automation fires (e.g. "new lead from campaign X") →
    action: send_flow { flow_id } → same as Path A from "gateway sends" onward

  Automation on flow response:
    trigger: flow_response { flow_id, conditions: { budget > 500jt } }
    actions: [
      update_fields { interest: 'hot' },
      assign_agent { department: 'senior_sales' },
      notify { channel: 'in_app', message: 'High-value lead submitted form' }
    ]

Flow templates managed in:
  /settings → Flows (new settings section) → CRUD flow templates
  Each template links to a Meta WA Flow ID or custom JSON schema
```
