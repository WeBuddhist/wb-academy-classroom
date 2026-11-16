#!/usr/bin/env bash
# A Postgres for local development, living inside the project.
#
#   ./scripts/dev-db.sh start      # create if needed, then run it
#   ./scripts/dev-db.sh stop
#   ./scripts/dev-db.sh status
#   ./scripts/dev-db.sh destroy    # stop and delete all local data
#
# It runs on port 55432 with its data in .pgdata/, so it cannot collide with a Postgres
# already running on this machine and can be removed by deleting one directory. Nothing
# is installed system-wide and no background service is registered.
#
# Requires the Postgres tools: `brew install postgresql@16` or `apt install postgresql`.

set -euo pipefail

cd "$(dirname "$0")/.."

PORT=55432
DATA=.pgdata
DB=wbac

find_pg_bin() {
  if command -v pg_ctl >/dev/null 2>&1; then
    dirname "$(command -v pg_ctl)"
    return
  fi
  # Homebrew and Debian keep these off PATH by default.
  for dir in /opt/homebrew/opt/postgresql@*/bin /usr/local/opt/postgresql@*/bin /usr/lib/postgresql/*/bin; do
    if [[ -x "$dir/pg_ctl" ]]; then
      echo "$dir"
      return
    fi
  done
  return 1
}

PG_BIN=$(find_pg_bin) || {
  echo "Could not find the Postgres tools (pg_ctl)." >&2
  echo "  macOS:  brew install postgresql@16" >&2
  echo "  Ubuntu: sudo apt install postgresql" >&2
  exit 1
}
export PATH="$PG_BIN:$PATH"

case "${1:-start}" in
  start)
    if [[ ! -d "$DATA" ]]; then
      echo "==> Creating a cluster in $DATA"
      initdb -D "$DATA" -U postgres --encoding=UTF8 --locale=C >/dev/null
    fi
    if pg_isready -h localhost -p "$PORT" -q 2>/dev/null; then
      echo "==> Already running on port $PORT"
    else
      echo "==> Starting on port $PORT"
      # -k /tmp puts the unix socket somewhere writable regardless of defaults.
      pg_ctl -D "$DATA" -o "-p $PORT -k /tmp" -l "$DATA/server.log" start >/dev/null
      pg_isready -h localhost -p "$PORT" --timeout=15 >/dev/null
    fi
    if ! psql -h localhost -p "$PORT" -U postgres -lqt | cut -d'|' -f1 | grep -qw "$DB"; then
      echo "==> Creating database $DB"
      createdb -h localhost -p "$PORT" -U postgres "$DB"
    fi
    echo
    echo "Ready. Put this in .env:"
    echo "  DATABASE_URL=postgres://postgres@localhost:$PORT/$DB"
    ;;

  stop)
    if [[ -d "$DATA" ]]; then
      pg_ctl -D "$DATA" stop >/dev/null 2>&1 && echo "==> Stopped" || echo "==> Was not running"
    else
      echo "==> Nothing to stop"
    fi
    ;;

  status)
    pg_isready -h localhost -p "$PORT" || true
    ;;

  destroy)
    "$0" stop || true
    rm -rf "$DATA"
    echo "==> Deleted $DATA"
    ;;

  *)
    echo "usage: $0 {start|stop|status|destroy}" >&2
    exit 1
    ;;
esac
