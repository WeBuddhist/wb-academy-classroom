#!/usr/bin/env bash
# Start everything needed for local development: the database, the API server and the
# web client.
#
#   ./scripts/dev.sh
#
# Ctrl+C stops the two servers. The database keeps running, because it holds your
# imported texts and starting it again is slower than leaving it up — stop it yourself
# with ./scripts/dev-db.sh stop.

set -euo pipefail

cd "$(dirname "$0")/.."

API_PORT=3000
WEB_PORT=5173

# Job control, so each server runs in its own process group and Ctrl+C can take down
# the whole tree. `npm run dev` spawns tsx and vite as children, and killing only the
# npm process would leave those orphaned and still holding the ports.
set -m

port_busy() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && exec 3<&- && return 0
  return 1
}

for port in "$API_PORT" "$WEB_PORT"; do
  if port_busy "$port"; then
    echo "Port $port is already in use — something is still running." >&2
    echo "Find it with:  lsof -i :$port" >&2
    exit 1
  fi
done

./scripts/dev-db.sh start

if [[ ! -f .env ]]; then
  echo
  echo "No .env found. Copy it and set HOST_PASSWORD:" >&2
  echo "  cp .env.example .env" >&2
  exit 1
fi

echo
echo "==> Starting the API and the client"

npm run dev -w @wbac/server &
SERVER_PID=$!
npm run dev -w @wbac/web &
WEB_PID=$!

cleanup() {
  trap - INT TERM EXIT
  echo
  echo "==> Stopping"
  # Negative PID means the whole process group, so tsx and vite go too.
  kill -- -"$SERVER_PID" 2>/dev/null || true
  kill -- -"$WEB_PID" 2>/dev/null || true
  wait 2>/dev/null || true
  echo "    The database is still running. Stop it with ./scripts/dev-db.sh stop"
}
trap cleanup INT TERM EXIT

# Report once the API is actually answering, rather than merely launched.
for _ in $(seq 1 30); do
  if curl -fsS "http://localhost:$API_PORT/api/health" >/dev/null 2>&1; then
    echo
    echo "    API    http://localhost:$API_PORT"
    echo "    App    http://localhost:$WEB_PORT   <- open this one"
    echo
    break
  fi
  sleep 1
done

wait
