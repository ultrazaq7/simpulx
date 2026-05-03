#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/simpulx}"
ENV_FILE="${SIMPULX_ENV_FILE:-/etc/simpulx/backend.env}"
TS="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="/var/backups/simpulx/${TS}-pre-compose-adopt"

cd "$APP_DIR"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing environment file: $ENV_FILE" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
ln -sf "$ENV_FILE" "$APP_DIR/.env"

export SIMPULX_ENV_FILE="$ENV_FILE"
export SIMPULX_CONFIG_DIR="${SIMPULX_CONFIG_DIR:-/etc/simpulx}"
export UPLOADS_VOLUME="${UPLOADS_VOLUME:-/var/lib/simpulx/uploads}"
export POSTGRES_VOLUME="${POSTGRES_VOLUME:-simpulx_postgres_data}"
export REDIS_VOLUME="${REDIS_VOLUME:-simpulx_redis_data}"

DB_PASSWORD="$(awk -F= '$1=="DB_PASSWORD" {sub(/^[^=]*=/, ""); print; exit}' "$ENV_FILE" | tr -d '\r')"
DB_PASSWORD="${DB_PASSWORD%\"}"
DB_PASSWORD="${DB_PASSWORD#\"}"
DB_PASSWORD="${DB_PASSWORD%\'}"
DB_PASSWORD="${DB_PASSWORD#\'}"

if [ -z "$DB_PASSWORD" ]; then
  echo "DB_PASSWORD is empty in $ENV_FILE" >&2
  exit 1
fi

echo "Writing pre-adoption backup to $BACKUP_DIR"
cp -a /etc/simpulx "$BACKUP_DIR/etc-simpulx" 2>/dev/null || true
cp -a /etc/nginx/sites-available/simpulx "$BACKUP_DIR/nginx-simpulx.conf" 2>/dev/null || true
pm2 jlist > "$BACKUP_DIR/pm2-jlist.json" 2>/dev/null || true
docker inspect simpulx-db simpulx-redis > "$BACKUP_DIR/docker-inspect.json" 2>/dev/null || true

if docker ps --format '{{.Names}}' | grep -qx 'simpulx-db'; then
  docker exec -e PGPASSWORD="$DB_PASSWORD" simpulx-db pg_dump -h 127.0.0.1 -U simpulx -d simpulx_crm -Fc > "$BACKUP_DIR/simpulx_crm.dump"
fi

echo "Stopping legacy PM2 API and standalone containers..."
pm2 stop simpulx-api || true
docker rm -f simpulx-db simpulx-redis 2>/dev/null || true

echo "Starting Compose-managed API, PostgreSQL, and Redis..."
docker compose up -d --build postgres redis api

curl --fail --silent --show-error --retry 30 --retry-delay 2 --retry-all-errors http://127.0.0.1:3002/docs >/dev/null

pm2 delete simpulx-api || true
pm2 save || true

if command -v nginx >/dev/null 2>&1; then
  nginx -t
  systemctl reload nginx || true
fi

docker compose ps
echo "Simpulx Compose adoption complete."
