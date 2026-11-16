#!/usr/bin/env bash
# Stop everything dev.sh started: the API, the client, and the database.
#
#   ./scripts/stop.sh              # stop all three
#   ./scripts/stop.sh --keep-db    # leave Postgres running
#
# Ctrl+C on dev.sh already stops the two servers. This exists for when that did not
# happen — a closed terminal, a crashed shell — and something is still holding the
# ports. Stopping the database loses nothing: the data stays in .pgdata/.

set -euo pipefail

cd "$(dirname "$0")/.."

KEEP_DB=0
case "${1:-}" in
  --keep-db) KEEP_DB=1 ;;
  "") ;;
  *) echo "usage: $0 [--keep-db]" >&2; exit 1 ;;
esac

if ! command -v lsof >/dev/null 2>&1; then
  echo "lsof is not available, so ports cannot be inspected." >&2
  echo "Stop the servers from the terminal running dev.sh instead." >&2
  exit 1
fi

stop_port() {
  local port=$1 name=$2 pids pgid
  pids=$(lsof -ti ":$port" -sTCP:LISTEN 2>/dev/null || true)

  if [[ -z "$pids" ]]; then
    printf '  %-6s port %-5s not running\n' "$name" "$port"
    return
  fi

  for pid in $pids; do
    # Kill the process group, not just the listener: `npm run dev` spawns tsx or vite
    # as a child, and killing one leaves the other holding the port.
    pgid=$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ' || true)
    if [[ -n "$pgid" ]]; then
      kill -- -"$pgid" 2>/dev/null || kill "$pid" 2>/dev/null || true
    else
      kill "$pid" 2>/dev/null || true
    fi
  done

  for _ in $(seq 1 25); do
    if ! lsof -ti ":$port" -sTCP:LISTEN >/dev/null 2>&1; then
      printf '  %-6s port %-5s stopped\n' "$name" "$port"
      return
    fi
    sleep 0.2
  done

  printf '  %-6s port %-5s STILL RUNNING — force it with: kill -9 $(lsof -ti :%s)\n' \
    "$name" "$port" "$port"
}

echo "==> Stopping"
stop_port 3000 "api"
stop_port 5173 "web"

if [[ "$KEEP_DB" == "1" ]]; then
  echo "  db     port 55432 left running (--keep-db)"
else
  ./scripts/dev-db.sh stop | sed 's/^==> /  db     /'
fi
