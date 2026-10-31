#!/usr/bin/env bash
# Starts the local backing services for development without Docker:
#   PostgreSQL 16 on :5434, MongoDB on :27018, mock Active Directory (LDAP) on :3890.
# Data lives in .data/ (git-ignored). Usage: dev-services.sh start|stop|status
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="$ROOT/.data"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
PGPORT=5434
mkdir -p "$DATA/logs"

declare -A PORT=([mongo]=27018 [ldap]=3890)

port_open() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
# PID listening on a port (works even if our pid file is stale or missing).
port_pid() { ss -ltnpH "sport = :$1" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2; }
running() { port_open "${PORT[$1]}"; }

start_bg() { # name, command...
  local name=$1; shift
  if running "$name"; then echo "✓ $name already running on :${PORT[$name]}"; return; fi
  (cd "$ROOT/apps/api" && nohup "$@" </dev/null >"$DATA/logs/$name.log" 2>&1 & echo $! >"$DATA/$name.pid")
}

wait_port() { # name, port
  for _ in $(seq 1 60); do
    if port_open "$2"; then echo "✓ $1 ready on :$2"; return; fi
    sleep 1
  done
  echo "✗ $1 did not start, see .data/logs/$1.log"; exit 1
}

case "${1:-start}" in
  start)
    [ -n "$PGBIN" ] || { echo "PostgreSQL binaries not found. Install postgresql-16 or set PGBIN."; exit 1; }
    if [ ! -d "$DATA/pg" ]; then "$PGBIN/initdb" -D "$DATA/pg" -U kompass --auth=trust -E UTF8 >/dev/null; fi
    if "$PGBIN/pg_ctl" -D "$DATA/pg" status >/dev/null 2>&1; then echo "✓ postgres already running"; else
      "$PGBIN/pg_ctl" -D "$DATA/pg" -o "-p $PGPORT -k /tmp -c listen_addresses=localhost" -l "$DATA/logs/postgres.log" -w start </dev/null >/dev/null 2>&1
      echo "✓ postgres ready on :$PGPORT"
    fi
    "$PGBIN/createdb" -h localhost -p $PGPORT -U kompass kompass 2>/dev/null || true
    start_bg mongo node --import tsx src/scripts/dev-mongo.ts
    start_bg ldap node --import tsx src/scripts/dev-ldap.ts
    wait_port mongo 27018
    wait_port ldap 3890
    ;;
  stop)
    for name in ldap mongo; do
      pid=$(port_pid "${PORT[$name]}")
      if [ -n "$pid" ]; then kill "$pid" && echo "stopped $name"; fi
      rm -f "$DATA/$name.pid"
    done
    [ -n "$PGBIN" ] && "$PGBIN/pg_ctl" -D "$DATA/pg" -w stop >/dev/null 2>&1 && echo "stopped postgres" || true
    ;;
  status)
    "$PGBIN/pg_ctl" -D "$DATA/pg" status >/dev/null 2>&1 && echo "postgres: running" || echo "postgres: stopped"
    for name in mongo ldap; do running "$name" && echo "$name: running" || echo "$name: stopped"; done
    ;;
  *) echo "usage: $0 start|stop|status"; exit 1 ;;
esac
