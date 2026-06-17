# Simpulx v2 — perintah dev. Semua via Docker (host tak perlu Go/Python).
COMPOSE = docker compose -f deploy/docker/compose.yml --env-file .env

.PHONY: env dev build up down logs ps smoke psql clean

env:            ## buat .env dari contoh bila belum ada
	@test -f .env || cp .env.example .env
	@echo ".env siap"

build: env      ## build semua image
	$(COMPOSE) build

dev: env        ## build + jalankan semua service
	$(COMPOSE) up -d --build
	@echo "Gateway:  http://localhost:8080/healthz"
	@echo "ai-agent: http://localhost:8000/healthz"
	@echo "knowledge:http://localhost:8001/healthz"
	@echo "realtime: ws://localhost:8082/ws?org=<org_id>"

up: env
	$(COMPOSE) up -d

down:           ## hentikan semua service
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f --tail=100

ps:
	$(COMPOSE) ps

smoke:          ## uji end-to-end (ingest FAQ -> webhook WA -> cek DB)
	bash scripts/smoke.sh

psql:           ## buka psql ke DB dev
	$(COMPOSE) exec postgres psql -U simpulx -d simpulx_v2

clean:          ## hentikan + hapus volume (DATA HILANG)
	$(COMPOSE) down -v
