#!/usr/bin/env bash
# Zero-surprise rollout on the server: back up, pull, migrate, restart, verify. Run from /opt/kompass.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${KOMPASS_TAG:?set KOMPASS_TAG to the image tag (git sha) to deploy}"
./infra/backup/backup.sh
docker compose -f infra/docker-compose.yml pull api web migrate
docker compose -f infra/docker-compose.yml run --rm migrate
docker compose -f infra/docker-compose.yml up -d api web
for i in $(seq 1 30); do
  if curl -fsS http://localhost:${KOMPASS_PORT:-8080}/api/health >/dev/null; then echo "deployed $KOMPASS_TAG"; exit 0; fi
  sleep 2
done
echo "health check failed after deploy of $KOMPASS_TAG"; exit 1
