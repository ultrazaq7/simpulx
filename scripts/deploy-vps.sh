#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/simpulx}"
BRANCH="${DEPLOY_BRANCH:-main}"
ENV_FILE="${SIMPULX_ENV_FILE:-/etc/simpulx/backend.env}"
APP_WEB_ROOT="${APP_WEB_ROOT:-/var/www/simpulx/app}"
LANDING_ROOT="${LANDING_ROOT:-/var/www/simpulx/landing}"
API_IMAGE_ARTIFACT="${SIMPULX_API_IMAGE_ARTIFACT:-}"
WEB_ARTIFACT="${SIMPULX_WEB_ARTIFACT:-}"
CLEAN_ARTIFACTS="${SIMPULX_CLEAN_ARTIFACTS:-0}"

cd "$APP_DIR"

git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing environment file: $ENV_FILE" >&2
  exit 1
fi

ln -sf "$ENV_FILE" "$APP_DIR/.env"
export SIMPULX_ENV_FILE="$ENV_FILE"
export SIMPULX_CONFIG_DIR="${SIMPULX_CONFIG_DIR:-/etc/simpulx}"
export UPLOADS_VOLUME="${UPLOADS_VOLUME:-/var/lib/simpulx/uploads}"
export POSTGRES_VOLUME="${POSTGRES_VOLUME:-simpulx_postgres_data}"
export REDIS_VOLUME="${REDIS_VOLUME:-simpulx_redis_data}"
export SIMPULX_API_UID="${SIMPULX_API_UID:-100}"
export SIMPULX_API_GID="${SIMPULX_API_GID:-101}"

if [[ "$UPLOADS_VOLUME" = /* ]]; then
  mkdir -p "$UPLOADS_VOLUME"
  chown -R "$SIMPULX_API_UID:$SIMPULX_API_GID" "$UPLOADS_VOLUME"
  chmod -R u+rwX,g+rwX,o+rX "$UPLOADS_VOLUME"
fi

if docker ps -a --format '{{.Names}}' | grep -qx 'simpulx-api'; then
  project="$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' simpulx-api 2>/dev/null || true)"
  if [ "$project" != "simpulx" ]; then
    echo "Existing non-Compose simpulx-api container found. Run scripts/adopt-compose-vps.sh once." >&2
    exit 1
  fi
fi

for name in simpulx-db simpulx-redis; do
  if docker ps -a --format '{{.Names}}' | grep -qx "$name"; then
    project="$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' "$name" 2>/dev/null || true)"
    if [ "$project" != "simpulx" ]; then
      echo "Existing non-Compose $name container found. Run scripts/adopt-compose-vps.sh once." >&2
      exit 1
    fi
  fi
done

run_db_migrations() {
  echo "Applying Simpulx DB migrations..."
  local db_user="${DB_USERNAME:-simpulx}"
  local db_name="${DB_DATABASE:-simpulx_crm}"
  for _ in $(seq 1 30); do
    if docker compose exec -T postgres pg_isready -U "$db_user" -d "$db_name" >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done
  docker compose exec -T postgres pg_isready -U "$db_user" -d "$db_name" >/dev/null
  for migration in "$APP_DIR"/backend/src/database/migration-v10-*.sql; do
    [ -f "$migration" ] || continue
    echo "Applying $(basename "$migration")"
    docker compose exec -T postgres psql \
      -v ON_ERROR_STOP=1 \
      -U "$db_user" \
      -d "$db_name" < "$migration"
  done
}

check_api_health() {
  local retries="${1:-30}"
  if curl --fail --silent --show-error --retry "$retries" --retry-delay 2 --retry-all-errors http://127.0.0.1:3002/health >/dev/null; then
    return 0
  fi

  echo "API healthcheck failed. Last container status:" >&2
  docker compose ps >&2 || true
  echo "Last API logs:" >&2
  docker compose logs --no-color --tail=200 api >&2 || true
  return 1
}

if [ -n "$API_IMAGE_ARTIFACT" ]; then
  if [ ! -f "$API_IMAGE_ARTIFACT" ]; then
    echo "API image artifact missing: $API_IMAGE_ARTIFACT" >&2
    exit 1
  fi
  echo "Loading CI-built API image..."
  if command -v gzip >/dev/null 2>&1; then
    gzip -dc "$API_IMAGE_ARTIFACT" | docker load
  else
    docker load -i "$API_IMAGE_ARTIFACT"
  fi
  [ "$CLEAN_ARTIFACTS" = "1" ] && rm -f -- "$API_IMAGE_ARTIFACT"
  docker compose up -d --no-build postgres redis
  run_db_migrations
  docker compose up -d --no-build api
elif [ "${SIMPULX_ALLOW_VPS_API_BUILD:-0}" = "1" ]; then
  echo "Building API image on VPS because SIMPULX_ALLOW_VPS_API_BUILD=1..."
  docker compose up -d --build postgres redis
  run_db_migrations
  docker compose up -d --build api
else
  echo "No CI-built API image artifact provided. Refusing to build API on VPS." >&2
  echo "Set SIMPULX_API_IMAGE_ARTIFACT or explicitly set SIMPULX_ALLOW_VPS_API_BUILD=1 for emergency manual builds." >&2
  exit 1
fi
docker compose ps

check_api_health 60

sync_static_dir() {
  local source_dir="$1"
  local target_dir="$2"

  if [ ! -d "$source_dir" ]; then
    echo "Static source directory missing: $source_dir" >&2
    exit 1
  fi

  mkdir -p "$target_dir"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "$source_dir"/ "$target_dir"/
  else
    find "$target_dir" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
    cp -a "$source_dir"/. "$target_dir"/
  fi
}

if [ -n "$WEB_ARTIFACT" ]; then
  if [ ! -f "$WEB_ARTIFACT" ]; then
    echo "Flutter web artifact missing: $WEB_ARTIFACT" >&2
    exit 1
  fi
  web_tmp="$(mktemp -d)"
  cleanup_web_tmp() {
    rm -rf -- "$web_tmp"
  }
  trap cleanup_web_tmp EXIT

  echo "Extracting CI-built Flutter web artifact..."
  tar -xzf "$WEB_ARTIFACT" -C "$web_tmp"
  if [ ! -f "$web_tmp/index.html" ]; then
    echo "Flutter web artifact is invalid: missing index.html" >&2
    exit 1
  fi
  sync_static_dir "$web_tmp" "$APP_WEB_ROOT"
  [ "$CLEAN_ARTIFACTS" = "1" ] && rm -f -- "$WEB_ARTIFACT"
elif [ "${SIMPULX_ALLOW_VPS_FLUTTER_BUILD:-0}" = "1" ]; then
  if ! command -v flutter >/dev/null 2>&1; then
    echo "Flutter is not installed on this host." >&2
    exit 1
  fi
  echo "Building Flutter web on VPS because SIMPULX_ALLOW_VPS_FLUTTER_BUILD=1..."
  (cd "$APP_DIR/frontend" && flutter pub get && flutter build web --release --base-href "/" --no-wasm-dry-run)
  sync_static_dir "$APP_DIR/frontend/build/web" "$APP_WEB_ROOT"
else
  echo "No CI-built Flutter web artifact provided. Refusing to build Flutter on VPS." >&2
  echo "Set SIMPULX_WEB_ARTIFACT or explicitly set SIMPULX_ALLOW_VPS_FLUTTER_BUILD=1 for emergency manual builds." >&2
  exit 1
fi

echo "Deploying landing page..."
sync_static_dir "$APP_DIR/landing" "$LANDING_ROOT"

if command -v nginx >/dev/null 2>&1; then
  nginx -t
  systemctl reload nginx || true
fi

check_api_health 10
curl --fail --silent --show-error --retry 10 --retry-delay 2 --retry-all-errors --insecure --resolve app.simpulx.com:443:127.0.0.1 https://app.simpulx.com/ >/dev/null
curl --fail --silent --show-error --retry 10 --retry-delay 2 --retry-all-errors --insecure --resolve simpulx.com:443:127.0.0.1 https://simpulx.com/ >/dev/null

echo "Simpulx deploy complete: API, Flutter web, and landing are live."
