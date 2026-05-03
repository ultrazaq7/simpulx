# Simpulx Deployment Flow

VPS: `root@76.13.18.144`

Domains:
- `https://simpulx.com` serves the landing page.
- `https://app.simpulx.com` serves the Flutter web app.
- `https://app.simpulx.com/api/*` proxies to the NestJS API.
- `https://app.simpulx.com/socket.io` proxies WebSocket traffic.
- `https://app.simpulx.com/uploads/*` serves user-uploaded files.

## Target Flow

```text
Local dev
Flutter + NestJS + PostgreSQL + Redis
        |
        | git push
        v
GitHub
GitHub Actions verify + deploy backend, Flutter web, and landing
        |
        | SSH deploy
        v
VPS
Docker Compose
├── NestJS API
├── PostgreSQL
├── Redis
└── Optional Nginx edge profile
```

The VPS currently hosts other apps too, so Simpulx keeps the host-level Nginx config by default. The Compose `nginx` service exists behind the `edge` profile and should only bind public ports after a deliberate cutover plan.

## Source Of Truth

Use this order for normal work:

1. Edit and test locally in `C:\Users\Fachmi Razaq\Documents\Simpulx`.
2. Commit changes locally.
3. Push to GitHub: `git@github.com:ultrazaq7/simpulx.git`.
4. GitHub Actions deploys to the VPS over SSH.

Do not edit source manually on the VPS unless it is an emergency hotfix. If that happens, copy the fix back to local and commit it.

## Required GitHub Secrets

Create these repository secrets before enabling auto deploy:

- `VPS_HOST`: `76.13.18.144`
- `VPS_USER`: `root`
- `VPS_SSH_KEY`: private SSH key allowed to access the VPS
- `VPS_SSH_PORT`: optional, defaults to `22`

The VPS checkout at `/opt/simpulx` must also be able to pull from GitHub, usually with a deploy key.

## Local Compose

```bash
cp .env.compose.example .env
docker compose up -d postgres redis
cd backend
npm ci
npm run start:dev
```

For a fully containerized local API:

```bash
cp .env.compose.example .env
docker compose up -d --build postgres redis api
```

The optional Docker Nginx profile listens on `8080` by default:

```bash
docker compose --profile edge up -d nginx
```

## VPS Layout

- `/opt/simpulx` is the Git checkout and Compose project.
- `/etc/simpulx/backend.env` is the production environment file.
- `/etc/simpulx/firebase-service-account.json` is the Firebase service account.
- `/etc/simpulx/gcp-key.json` is the Google API service account.
- `/var/lib/simpulx/uploads` is runtime upload/user media storage.
- `/var/www/simpulx/app` is the live Flutter web build served by host Nginx.
- `/var/www/simpulx/landing` is the live landing page served by host Nginx.
- `/var/backups/simpulx` stores DB/config/path migration backups.

## VPS Compose Adoption

Run this once when moving from the old PM2/manual containers into Compose-managed API, PostgreSQL, and Redis:

```bash
ssh root@76.13.18.144
cd /opt/simpulx
git pull --ff-only origin main
bash scripts/adopt-compose-vps.sh
```

After adoption, normal deploys use:

```bash
bash scripts/deploy-vps.sh
```

`scripts/deploy-vps.sh` now deploys the API, builds Flutter web, syncs the landing page, validates Nginx, and runs health checks.

## Manual Frontend Web Deploy

Use this only for emergency manual deploys outside GitHub Actions:

```bash
ssh root@76.13.18.144
cd /opt/simpulx
git pull --ff-only origin main
cd frontend
flutter pub get
flutter build web --release --base-href "/"
rm -rf /var/www/simpulx/app/*
cp -a build/web/. /var/www/simpulx/app/
nginx -t && systemctl reload nginx
```

## Manual Landing Deploy

```bash
ssh root@76.13.18.144
cd /opt/simpulx
git pull --ff-only origin main
rm -rf /var/www/simpulx/landing/*
cp -a landing/. /var/www/simpulx/landing/
nginx -t && systemctl reload nginx
```

## Health Checks

```bash
ssh root@76.13.18.144 "docker compose -f /opt/simpulx/compose.yml ps; nginx -t; df -h /"
ssh root@76.13.18.144 "curl -kI --resolve app.simpulx.com:443:127.0.0.1 https://app.simpulx.com/docs"
ssh root@76.13.18.144 "curl -kI --resolve simpulx.com:443:127.0.0.1 https://simpulx.com/"
```

## Safety Rules

- Do not keep secrets in Git.
- Do not keep generated Flutter web builds in Git.
- Do not keep uploads in Git.
- Do not delete `/var/lib/simpulx/uploads` without a backup.
- Do not delete `/etc/simpulx/*` without a backup.
- Do not bind a Docker Nginx container to `80/443` while host Nginx is serving other apps.
- Do not touch other apps on the same VPS: `/opt/ncd-crm`, `/opt/eaziva-lite`, `/var/www/my.eaziva.com`, and Eaziva Docker containers.

## Mobile Firebase Config

The legacy Firebase config files are intentionally not tracked. Before building Android or iOS with push notifications, add fresh Simpulx Firebase files locally:

- `frontend/android/app/google-services.json`
- `frontend/ios/Runner/GoogleService-Info.plist`
