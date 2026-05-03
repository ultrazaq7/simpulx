#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/simpulx}"
BRANCH="${DEPLOY_BRANCH:-main}"
ENV_FILE="${SIMPULX_ENV_FILE:-/etc/simpulx/backend.env}"
APP_WEB_ROOT="${APP_WEB_ROOT:-/var/www/simpulx/app}"
LANDING_ROOT="${LANDING_ROOT:-/var/www/simpulx/landing}"

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

docker compose up -d --build postgres redis api
docker compose ps

curl --fail --silent --show-error --retry 20 --retry-delay 2 --retry-all-errors http://127.0.0.1:3002/docs >/dev/null

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

if command -v flutter >/dev/null 2>&1; then
  echo "Building Flutter web..."
  (cd "$APP_DIR/frontend" && flutter pub get && flutter build web --release --base-href "/" --no-wasm-dry-run)
  sync_static_dir "$APP_DIR/frontend/build/web" "$APP_WEB_ROOT"
else
  echo "Flutter is not installed on this host; skipping Flutter web deploy." >&2
  exit 1
fi

echo "Deploying landing page..."
sync_static_dir "$APP_DIR/landing" "$LANDING_ROOT"

if command -v nginx >/dev/null 2>&1; then
  nginx -t
  systemctl reload nginx || true
fi

curl --fail --silent --show-error --retry 10 --retry-delay 2 --retry-all-errors http://127.0.0.1:3002/docs >/dev/null
curl --fail --silent --show-error --retry 10 --retry-delay 2 --retry-all-errors --insecure --resolve app.simpulx.com:443:127.0.0.1 https://app.simpulx.com/ >/dev/null
curl --fail --silent --show-error --retry 10 --retry-delay 2 --retry-all-errors --insecure --resolve simpulx.com:443:127.0.0.1 https://simpulx.com/ >/dev/null

echo "Simpulx deploy complete: API, Flutter web, and landing are live."
