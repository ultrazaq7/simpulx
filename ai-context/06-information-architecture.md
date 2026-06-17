# 06 — Information Architecture

## Top-level dashboard nav (web)

Defined in `web/components/Shell.tsx`. Left sidebar (collapsible, 72px → 240px):

```
Dashboard      /dashboard
Inbox          /inbox
Contacts       /contacts
Broadcasts     /broadcasts
Follow-ups     /sequences
———
Settings       /settings           (bottom nav)
```

Top bar: page title + category, global search (Ctrl+K), notifications, user menu.

## Settings IA (persistent layout)

`web/app/settings/layout.tsx` renders `Shell` + a settings sidebar **once** (persists
across child navigation; no remount/scroll-jump). Every section is a **real route**.
`/settings` redirects to `/settings/general`.

```
Account
  General           /settings/general          workspace name, signed-in info
  Branding          /settings/branding         page/meta title
  Notifications     /settings/notifications     sound / new message / new conversation
Users
  People            /settings/people           paginated user table
  Roles & Permissions /settings/roles          permission matrix
  Departments       /settings/departments      dept CRUD
AI & Tools
  AI Agent          /settings/ai               model, prompt, temperature, handoff
  Knowledge Base    /settings/knowledge        ingest + sources table
Marketing & Dev
  Campaigns         /settings/campaigns        paginated campaign table
  Templates         /settings/templates        HSM templates
  Automation        /settings/automation       rules + /settings/automation/[id]/flow
  Channels          /settings/channels         WA/Meta channels
  Web API           /settings/integrations     API lead sources
Security
  Audit log         /settings/audit            mutating-action history
```

Active section is derived from `usePathname()` (longest matching prefix), so nested
routes like `/settings/automation/{id}/flow` keep "Automation" highlighted.

## Public / auth routes

```
/login            /forgot-password            /reset-password?token=...
```

## Primary data hierarchy

```
Organization (tenant)
├── Users (roles) ── agent_departments ── Departments
├── Campaigns ── campaign_agents ── Users
│     └── (attribution: ad_source_ids[], keywords[])
├── Channels (WhatsApp / Meta)
├── Contacts
│     └── Conversations (one per campaign per contact)
│           ├── Messages (Sent→Delivered→Read→Replied)
│           ├── Internal notes
│           ├── conversation_events
│           ├── stage_id → Stages (funnel)
│           ├── disposition_id → Dispositions
│           ├── ai_runs (classification/extraction trace)
│           └── sequence_enrollments → Sequences/steps
├── AI agents · ai_tools · knowledge_sources → knowledge_chunks (pgvector)
├── Message templates · Automations · Broadcasts · Quick replies
├── Web API sources · Audit log · FCM tokens · password_reset_tokens
└── settings (jsonb): branding, notifications, role_permissions
```

## Two independent classification axes (do not merge)

- **Interest level** (score): hot / warm / cold.
- **Stage** (funnel): New Lead → Contacted → Qualified → Appointment → Test Drive → SPK
  (won) → Delivered (won). Plus dispositions (off_topic, no_response, lost, ...).
