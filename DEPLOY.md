# Simpulx — Production Deploy (AWS single box + Cloudflare)

One Graviton EC2 instance runs the whole Docker Compose stack (Postgres, Redis,
NATS, MinIO, the Go services, the AI agent, the Next.js web app) behind **Caddy**.
**Cloudflare** sits in front (proxied) and terminates client TLS; Caddy serves a
**Cloudflare Origin Certificate** so CF↔origin is encrypted (SSL mode: Full strict).

```
Cloudflare (proxied, edge TLS, CDN/DDoS)
        │  HTTPS (Origin Cert, Full strict)
        ▼
EC2 (Caddy :443) ──► web:3000  (app.simpulx.com)
                  ├► gateway:8080  (/api /auth /webhook /v1 /simpulx-media)
                  ├► realtime:8082 (/ws)
                  └► /srv/landing  (simpulx.com)
   + postgres · redis · nats · minio · ai-agent · messaging · conversation · broadcasts · knowledge
```

Target cost ≈ **$45-50/mo** (well under 1jt). LLM/Meta API billed separately.

---

## 1. Provision EC2
- **Instance:** `t4g.large` (2 vCPU ARM Graviton, 8 GB). Buy a **1-yr Compute Savings Plan** after it's stable (~30% off).
- **AMI:** Ubuntu Server 24.04 LTS **arm64**.
- **Storage:** 50 GB gp3.
- **Region:** `ap-southeast-3` (Jakarta, lowest latency) or `ap-southeast-1` (Singapore, cheaper).
- **Elastic IP:** allocate + associate (stable IP for DNS).

### Security group
| Port | Source | Why |
|---|---|---|
| 22 | **your IP only** | SSH |
| 80, 443 | **Cloudflare IP ranges only** | edge → origin (don't allow 0.0.0.0/0) |
| egress | all | pulls, APIs |

Cloudflare IP list: https://www.cloudflare.com/ips/ — add the v4 + v6 ranges to 80/443. This makes the origin reachable *only* through Cloudflare (hides the box, blocks direct hits).

---

## 2. Install Docker
```bash
ssh ubuntu@<elastic-ip>
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu && newgrp docker
docker version && docker compose version
```

## 2b. Add swap (4 GB) — required on a 4 GB box (t4g.medium)
A fresh EC2 has no swap; Next.js/Go builds can briefly spike past 4 GB and OOM.
A 4 GB swapfile (on the 50 GB disk) is a free safety net. Skip only if on 8 GB+.
```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab        # persist across reboots
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swap.conf      # only swap when RAM is tight
sudo sysctl -p /etc/sysctl.d/99-swap.conf
free -h   # verify: Swap shows 4.0Gi
```

## 3. Get the code
```bash
sudo mkdir -p /opt/simpulx && sudo chown $USER /opt/simpulx
git clone git@github.com:ultrazaq7/simpulx.git /opt/simpulx   # main = flattened repo (no v2/)
cd /opt/simpulx
```

## 4. Secrets — create `.env` at repo root
```bash
cat > .env <<'EOF'
# Postgres
POSTGRES_USER=simpulx
POSTGRES_PASSWORD=<STRONG_RANDOM>
POSTGRES_DB=simpulx_v2
# Auth / app
JWT_SECRET=<STRONG_RANDOM>
# AI
ANTHROPIC_API_KEY=<key>
LLM_PROVIDER=anthropic
# Object storage (MinIO)
S3_ACCESS_KEY=<STRONG_RANDOM>
S3_SECRET_KEY=<STRONG_RANDOM>
S3_BUCKET=simpulx-media
# Meta / WhatsApp
META_APP_SECRET=<...>
META_VERIFY_TOKEN=<...>
# ... any other vars your services read
EOF
chmod 600 .env
```
> Generate randoms: `openssl rand -base64 32`. `.env` is gitignored — never commit it.

## 5. Cloudflare Origin Certificate
1. Cloudflare dashboard → **SSL/TLS → Origin Server → Create Certificate**.
2. Hostnames: `simpulx.com, *.simpulx.com`. Download cert + key.
3. On the box:
   ```bash
   nano deploy/docker/certs/origin.pem   # paste certificate
   nano deploy/docker/certs/origin.key   # paste private key
   chmod 600 deploy/docker/certs/origin.key
   ```
4. Cloudflare → **SSL/TLS → Overview → Full (strict)**.

## 6. Build & start
> **Always pass `--env-file .env`.** Compose resolves `${VAR}` interpolation
> (e.g. `POSTGRES_PASSWORD`) from the *compose-file* directory, not the repo root,
> so without this flag Postgres initialises with the default password while the
> services read the real one from `env_file` → `password authentication failed`.
> Define it once so every command is consistent:
```bash
DC="docker compose --env-file .env -f deploy/docker/compose.yml -f deploy/docker/compose.prod.yml"
$DC up -d --build
$DC ps
```
First build takes a few minutes (Go + Next.js compile natively on ARM).
> If you ever change `POSTGRES_PASSWORD` after the first start, the existing
> `simpulx-v2_v2_pgdata` volume keeps the old one — recreate it:
> `$DC down && docker volume rm simpulx-v2_v2_pgdata && $DC up -d`.

## 7. Repoint Cloudflare DNS (from old VPS → AWS)
In Cloudflare → DNS, edit the **A** records (all **Proxied / orange**):
| Name | Content | Proxy |
|---|---|---|
| `simpulx.com` | `<elastic-ip>` | Proxied |
| `app` | `<elastic-ip>` | Proxied |
| `www` | `<elastic-ip>` | Proxied |
Remove the old `76.13.18.144` records.

## 8. Verify
```bash
curl -I https://app.simpulx.com            # 200, web app
curl -sI https://app.simpulx.com/api/...   # gateway reachable
# open https://app.simpulx.com in a browser, log in, check the inbox WS connects
```

---

## Ops
> All commands assume `DC` from step 6 (`docker compose --env-file .env -f … -f …`).
- **Update:** `git pull && $DC up -d --build`
- **Logs:** `$DC logs -f caddy gateway web`
- **DB backup (cron):** `0 3 * * * docker exec simpulx-v2-db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip > /opt/backups/db_$(date +\%F).sql.gz` (rotate with `find -mtime +14 -delete`).
- **Landing:** drop your HTML/assets into `deploy/docker/landing/` (served at simpulx.com); no rebuild needed (volume-mounted), just place files.
- **Single box = no HA.** Snapshot the EBS volume periodically.

> Reminder: this needs the **flattened `main`** (merge `chore/repo-cleanup` first). Until merged, the old `.github/workflows/deploy.yml` would still try to deploy v1 to the retired VPS.
