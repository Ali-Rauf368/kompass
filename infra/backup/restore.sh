#!/usr/bin/env bash
# Restore from a backup pair produced by backup.sh. Usage: restore.sh 2026-10-31_0200
set -euo pipefail
STAMP="${1:?usage: restore.sh <timestamp>}"
SRC="${BACKUP_DIR:-/var/backups/kompass}"
COMPOSE="docker compose -f $(dirname "$0")/../docker-compose.yml"
read -r -p "This replaces the current data with the backup from $STAMP. Type RESTORE to continue: " ok
[ "$ok" = "RESTORE" ] || { echo "aborted"; exit 1; }
$COMPOSE stop api
$COMPOSE exec -T postgres pg_restore -U kompass -d kompass --clean --if-exists < "$SRC/postgres_$STAMP.dump"
$COMPOSE exec -T mongo mongorestore --archive --gzip --drop < "$SRC/mongo_$STAMP.archive.gz"
$COMPOSE start api
echo "restored $STAMP"
