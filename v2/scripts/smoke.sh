#!/usr/bin/env bash
# Smoke test end-to-end untuk vertical slice Fase 1.
# Prasyarat: `make dev` sudah up dan sehat.
set -euo pipefail

ORG="00000000-0000-0000-0000-0000000000a1"   # org demo (seed)
PNID="1234567890"                             # phone_number_id channel demo (seed)
FROM="628111222333"
GATEWAY="http://localhost:8080"
KNOWLEDGE="http://localhost:8001"
COMPOSE="docker compose -f deploy/docker/compose.yml --env-file .env"

echo "==> 1. Ingest FAQ ke knowledge base"
curl -sS -X POST "$KNOWLEDGE/ingest" \
  -H 'content-type: application/json' \
  -d "{\"organization_id\":\"$ORG\",\"title\":\"Jam Operasional\",\"content\":\"Toko kami buka setiap hari Senin sampai Jumat pukul 08.00 hingga 17.00 WIB. Sabtu buka pukul 09.00 sampai 14.00. Minggu dan hari libur nasional tutup.\"}"
echo; echo

echo "==> 2. Kirim webhook WhatsApp simulasi (pertanyaan yang ADA di knowledge base)"
curl -sS -X POST "$GATEWAY/webhook/whatsapp" \
  -H 'content-type: application/json' \
  -d "{\"object\":\"whatsapp_business_account\",\"entry\":[{\"id\":\"demo-waba\",\"changes\":[{\"field\":\"messages\",\"value\":{\"messaging_product\":\"whatsapp\",\"metadata\":{\"display_phone_number\":\"628\",\"phone_number_id\":\"$PNID\"},\"contacts\":[{\"wa_id\":\"$FROM\",\"profile\":{\"name\":\"Budi\"}}],\"messages\":[{\"from\":\"$FROM\",\"id\":\"wamid.SMOKE1\",\"timestamp\":\"1700000000\",\"type\":\"text\",\"text\":{\"body\":\"halo, jam buka toko kapan ya?\"}}]}}]}]}"
echo; echo

echo "==> 3. Tunggu pipeline (gateway->messaging->ai-agent->messaging)"
sleep 4

echo "==> 4. Isi tabel messages untuk percakapan ini:"
$COMPOSE exec -T postgres psql -U simpulx -d simpulx_v2 -c \
  "SELECT direction, sender_type, LEFT(body,60) AS body, status FROM messages ORDER BY created_at;"

echo "==> 5. Jejak ai_runs (keputusan AI + RAG):"
$COMPOSE exec -T postgres psql -U simpulx -d simpulx_v2 -c \
  "SELECT decision, confidence, array_length(retrieved_chunk_ids,1) AS chunks, latency_ms FROM ai_runs ORDER BY created_at;"

echo
echo "Sukses bila: ada baris outbound (sender_type=bot) berisi jam operasional,"
echo "dan ai_runs.decision='reply' dengan chunks>=1."
