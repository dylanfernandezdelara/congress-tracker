#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-8787}"
HOST="${HOST:-127.0.0.1}"
WORKER_URL="${WORKER_URL:-http://${HOST}:${PORT}}"
LOG_PATH="${LOG_PATH:-/tmp/wrangler-test-scheduled.log}"

cd "$(dirname "$0")/.."

rm -f "$LOG_PATH"

echo "Starting wrangler dev --test-scheduled on ${HOST}:${PORT}..."
npx wrangler dev --test-scheduled --port "$PORT" >"$LOG_PATH" 2>&1 &
WRANGLER_PID=$!

cleanup() {
  if ps -p "$WRANGLER_PID" >/dev/null 2>&1; then
    kill "$WRANGLER_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

echo "Waiting for dev server to be ready..."
for _ in {1..30}; do
  if rg -q "Ready on http://(localhost|127\\.0\\.0\\.1|${HOST}):${PORT}" "$LOG_PATH"; then
    break
  fi
  sleep 1
done

echo "Triggering scheduled event..."
if ! curl -fsS "${WORKER_URL}/__scheduled" >/dev/null; then
  curl -fsS "${WORKER_URL}/cdn-cgi/handler/scheduled" >/dev/null
fi

echo "Waiting for ingestion to complete (check $LOG_PATH for details)..."
for _ in {1..120}; do
  if rg -q "Scheduled ingestion COMPLETE" "$LOG_PATH"; then
    rg -n "\\[scheduled\\]" "$LOG_PATH" || true
    exit 0
  fi
  if rg -q "FATAL: Scheduled ingestion failed" "$LOG_PATH"; then
    rg -n "\\[scheduled\\]" "$LOG_PATH" || true
    echo "Ingestion failed. See $LOG_PATH for details."
    exit 1
  fi
  sleep 2
done

echo "Timed out waiting for ingestion to finish. See $LOG_PATH for details."
exit 1
