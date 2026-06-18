# 21 — WhatsApp Business Calling API (scope)

**Status: SCOPED, not built (2026-06-04).** Owner picked the "real WA call + automatic duration"
path. This doc is the research + architecture + phasing before any code. Verify the ⚠️ items
against the live WABA before building.

## Why this path
`wa.me` only opens a CHAT — there is **no link/URI to start a WhatsApp call** from a browser, and
no way to read a call's duration from outside the app. The only way to place a real WA call and get
accurate duration is Meta's **WhatsApp Business Calling API** (VoIP over the Cloud API), GA-rolling
through 2024–2026.

## Key facts (from Meta docs + integration guides, June 2026)
- **Two directions:** user-initiated (customer calls the business number) and **business-initiated**
  (we call the customer) — business-initiated is what the agent's call button needs.
- **Availability:** blocked in **USA, Canada, Egypt, Vietnam, Nigeria**; available everywhere else
  Cloud API runs → **Indonesia is supported.** ✅ ⚠️ confirm it's enabled on our specific WABA.
- **Media:** signaling = SIP over HTTPS/TLS; **media = WebRTC (ICE + DTLS + SRTP)**. So a
  **browser-based agent can talk directly in-browser** (getUserMedia + RTCPeerConnection) — no
  external softphone needed. (Advanced "SIP + SDES/OPUS" mode exists for PBX setups; we don't need it.)
- **Duration:** the **`call` webhook `terminate`/ended event includes `duration`** (+ hangup cause +
  quality metrics). This is our source of truth for `total_call_duration` — no manual entry.
- **Prereqs:** business number live on Cloud API; app has `whatsapp_business_messaging`; subscribe the
  app to the **`calls`** webhook field; messaging limit **≥ 2000 conversations / 24h**.
- **Limits:** **100 business-initiated calls per user / day** (raised from 10 in Dec 2025); sandbox 25/day.
- **Consent:** business-initiated calls require the user to have granted **call permission**
  (`callback_permission_status`) first. ⚠️ confirm exact request/grant flow (likely an in-chat
  permission request the customer accepts).
- **BSP optional:** works direct on Cloud API, or via a BSP (360dialog, Infobip) that wraps it.
  ⚠️ decide direct-vs-BSP (depends on how our number is currently provisioned).

## Architecture for Simpulx
```
Agent browser (web)  ──WebRTC audio (SRTP)──►  Meta WA infra  ◄──►  Customer's WhatsApp
        │  call control (start/accept/hangup) via gateway                     │
        ▼                                                                      ▼
   gateway (Go)  ──Graph API (call init/terminate, SDP)──►  Meta Cloud API
   gateway (Go)  ◄──webhook `calls` (connect/accept/terminate+duration)──  Meta
        │
        └─ persist → conversations.total_call_duration (+call_attempts) + call_logs(call_type='whatsapp_api')
```
The existing `call_attempts` / `total_call_duration` columns and `POST /api/conversations/{id}/calls`
get **repurposed**: instead of the manual `duration:0` log, the **webhook** writes the real duration.

## Done already (2026-06-04): the gate + channel wiring
- `channels.calling_enabled` (bool, default false) + `campaigns.channel_id` (FK) added (mig `0030`).
- `/api/conversations` returns `calling_enabled` (campaign→channel); the inbox **call button only
  shows when the channel has calling enabled**. So nothing is built/broken visibly until OTO's
  channel is turned on (`UPDATE channels SET calling_enabled=true WHERE id=<oto channel>` + assign
  that channel to the campaign).

## BUILT (2026-06-18): full both-direction calling, end-to-end
- **`calls` table** (mig `0039`) + **`calls.direction`** (mig `0040`, default `outbound`).
- **realtime fix:** the service now forwards `events.call.updated` to browsers (it was missing, so
  the whole WS-based signaling was dead — overlay just span). Frontend listens to the app-wide WS
  (Shell `ws_message`), not a second socket.
- **OUTBOUND** (gateway `calls.go`): request-permission → initiate (browser SDP offer → Meta
  `/calls` connect) → webhook `connect` returns the customer's SDP answer → browser completes WebRTC.
  `CallOverlay.tsx` drives requesting→granted→ringing→connected→ended.
- **INBOUND** (the part the owner asked for): webhook `connect` with `direction=USER_INITIATED`
  (or `sdp_type=offer`) → `handleInboundCall` finds the conversation, creates an inbound `calls`
  row, and **rings the conversation's ASSIGNED agent** (broadcast carries `agent_id` + the SDP
  offer; unassigned → rings all, first-to-answer wins via an atomic `WHERE call_status='incoming'`
  claim). `IncomingCallListener.tsx` (mounted in `Shell`) rings the agent anywhere in the app and
  opens `CallOverlay` in inbound mode → Accept builds the SDP answer → `POST /api/calls/{id}/accept`
  (Meta `action: accept`); Reject → `/reject`.
- **Duration:** webhook `terminate` uses Meta's authoritative `duration`; rolled into
  `conversations.call_attempts` + `total_call_duration` (`persistCallDuration`).
- **Routes:** `POST /api/calls/{request-permission,initiate,{id}/accept,{id}/reject,{id}/end}`,
  `GET /api/calls/{id}`.

### Still TODO before live (needs Meta/owner, not code)
- Confirm Calling API enabled on the WABA + ID region, messaging limit ≥2000, `calls` webhook
  subscribed; decide direct vs BSP. Everything above runs in `WA_MOCK` until real creds exist.
- The exact Meta interactive/permission payload + accept/reject body shapes are best-effort from
  docs (⚠️) — verify against the live WABA and adjust `sendCallPermissionRequest` /
  `postMetaCallAcceptReject` / `postMetaCallInitiate` if Meta's shape differs.
- TURN server: only STUN is configured; real calls behind strict NAT will need TURN.

## Open items to verify before build (⚠️)
- Calling API actually enabled on our WABA + our number's provisioning (direct Cloud API vs BSP).
- Exact business-initiated **consent** request/grant mechanism + how to check `callback_permission_status`.
- The precise SDP/offer-answer exchange shape for WebRTC (from the calling reference).
- Pricing per call/minute for ID.

## Sources
- Meta: developers.facebook.com/docs/whatsapp/cloud-api/calling/
- 360dialog BSP: docs.360dialog.com/partner/messaging/calling-api/business-initiated-whatsapp-calls
- Infobip: infobip.com/docs/whatsapp/whatsapp-business-calling/business-initiated-calling
- Integration guide (limits/regions/WebRTC): wuseller.com WhatsApp Business Calling API Integration, SIP & Limits 2026
