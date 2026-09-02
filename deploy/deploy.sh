#!/bin/sh
# Deploy auf dem VPS: neuesten Stand ziehen, Image bauen, neu starten.
# Migrationen laufen im Container-Start (Dockerfile CMD).
set -e
cd /opt/dtd-booking/repo
git fetch origin main
git reset --hard origin/main
docker compose --env-file /opt/dtd-booking/.env -f deploy/docker-compose.yml build app
docker compose --env-file /opt/dtd-booking/.env -f deploy/docker-compose.yml up -d
docker image prune -f >/dev/null
echo "Deploy fertig: $(git rev-parse --short HEAD)"
