# 04 — User Personas

Four roles exist in the system (`users.role`): `owner`, `admin`, `manager`, `agent`.
Custom roles can be created in the roles matrix. Below are the working personas behind
those roles.

## Persona 1 — Sales Agent ("Rama") · role `agent`

- **Context:** Works the floor at a dealer. Lives in the inbox on mobile + web. Handles
  the WhatsApp leads assigned to him.
- **Goals:** Respond fast, qualify, get the customer to a test drive / SPK. Hit SLA.
- **Pains (v1):** Shared inbox noise; cold leads mixed with hot; forgetting to follow up.
- **In Simpulx:** Sees **only his assigned conversations** (BR-20). Gets hot/warm/cold
  scoring and extracted lead fields without data entry. Auto follow-up covers his gaps.
  Taps "Call Customer" to WA-call the lead.
- **Permissions:** own chats, contacts, close/assign within his scope; no settings.

## Persona 2 — Sales Manager ("Sari") · role `manager`

- **Context:** Runs one or more dealer campaigns. Owns the team's numbers.
- **Goals:** Fair lead split, fast first-response, high conversion, spot stalls.
- **In Simpulx:** Sees **conversations in her campaigns + unassigned** (BR-20). Manages
  her campaigns' agents and round-robin. Watches SLA + conversion analytics.
- **Permissions:** campaign-scoped visibility; campaign/team management per role matrix;
  not workspace-wide admin.

## Persona 3 — Platform Admin ("Dimas") · role `admin`

- **Context:** OTO operations/marketing ops. Configures the platform for all dealers.
- **Goals:** Onboard dealers/campaigns, wire CTWA ad sources + keywords, manage channels,
  templates, automations, users, roles.
- **In Simpulx:** Sees **everything**. Can change a user's email and reset their password
  from the People page. Edits the role permission matrix. Reviews the audit log.
- **Permissions:** full access (locked-on in the roles matrix).

## Persona 4 — Owner ("Bu Lestari") · role `owner`

- **Context:** Business owner / account principal.
- **Goals:** Top-line conversion, cost-per-lead efficiency, team accountability.
- **In Simpulx:** Same full access as admin, plus (future) billing/workspace-level
  actions. Mostly consumes dashboards.

## Secondary actors (not dashboard users)

- **Customer / Lead** — the WhatsApp end user who clicked a CTWA ad. Never logs in;
  experiences Simpulx only as WhatsApp messages.
- **Meta / WhatsApp Cloud API** — sends webhooks, receives outbound sends.
- **AI Agent (system)** — classifies, extracts, drafts follow-ups. A system actor, not a
  persona, but its outputs are visible to all human roles.

## Role → capability summary

| Capability | agent | manager | admin/owner |
|---|---|---|---|
| See own chats | ✅ | ✅ | ✅ |
| See campaign chats + unassigned | — | ✅ | ✅ |
| See all chats | — | — | ✅ |
| Manage own campaigns | — | ✅ | ✅ |
| Manage users / roles / channels | — | per matrix | ✅ |
| Change user email / reset password | own name only | — | ✅ |
| Edit role permission matrix | — | — | ✅ |
