# Kontrak Event (NATS JetStream)

Fase 1 memakai **event JSON** sebagai kontrak antar-service (gRPC menyusul di Fase 2).
Semua event dipublish ke stream `EVENTS` (subjects `events.>`). Field umum:

```jsonc
{
  "id": "uuid",            // id event (idempotency)
  "type": "message.received",
  "org_id": "uuid",
  "ts": "RFC3339",
  "data": { ... }          // payload spesifik per tipe
}
```

## `events.message.received`
Dipublish oleh **gateway** saat webhook inbound diterima & sudah di-ACK ke Meta.
Payload `data`:
```jsonc
{
  "channel": "whatsapp",
  "phone_number_id": "1234567890",   // utk mencocokkan channel/org
  "from": "628111111111",            // wa id pengirim (E.164 tanpa +)
  "contact_name": "Budi",
  "message": {
    "external_id": "wamid.xxx",
    "type": "text",                  // text|image|audio|...
    "text": "halo, jam buka kapan?",
    "media_url": null
  },
  "raw": { ... }                     // payload mentah Meta (audit)
}
```

## `events.message.persisted`
Dipublish oleh **messaging** setelah pesan (inbound/outbound) tersimpan.
Konsumer: **ai-agent** (hanya inbound), **realtime** (broadcast ke dashboard).
Payload `data`:
```jsonc
{
  "conversation_id": "uuid",
  "contact_id": "uuid",
  "message_id": "uuid",
  "direction": "inbound",            // inbound|outbound
  "sender_type": "contact",          // contact|agent|bot|system
  "type": "text",
  "body": "halo, jam buka kapan?",
  "preview": "halo, jam buka kapan?"
}
```

## `events.message.outbound`
Dipublish oleh **ai-agent** (atau agen via gateway) untuk meminta pengiriman.
Konsumer: **messaging** (kirim ke WhatsApp Cloud API, lalu persist + `message.persisted`).
Payload `data`:
```jsonc
{
  "conversation_id": "uuid",
  "sender_type": "bot",              // bot|agent
  "sender_id": null,                 // user id bila agent
  "type": "text",
  "body": "Halo Budi! Kami buka 08.00–17.00 WIB."
}
```

## `events.conversation.handoff`
Dipublish oleh **ai-agent** saat AI mengalihkan ke manusia (confidence < ambang
atau permintaan eksplisit). Konsumer: **conversation** (routing/assign) & **realtime**.
Payload `data`:
```jsonc
{
  "conversation_id": "uuid",
  "reason": "low_confidence",
  "confidence": 0.41
}
```

## `events.conversation.assigned`
Dipublish oleh **conversation** setelah percakapan di-assign ke agen (round-robin
least-loaded). Konsumer: **realtime** (update dashboard agen).
Payload `data`:
```jsonc
{
  "conversation_id": "uuid",
  "agent_id": "uuid",
  "agent_name": "Agent Satu",
  "department_id": "uuid"        // opsional
}
```

## `events.conversation.closed`
Dipublish oleh **conversation** saat percakapan ditutup (manual atau auto-close
idle oleh lifecycle ticker). Konsumer: **realtime**.
Payload `data`:
```jsonc
{
  "conversation_id": "uuid",
  "reason": "auto_idle"          // auto_idle|manual|resolved
}
```
