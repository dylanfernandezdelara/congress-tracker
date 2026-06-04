#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=/dev/null
source "${ROOT_DIR}/scripts/lib/proc.sh"
WEB_HOST="${WEB_HOST:-127.0.0.1}"
WEB_PORT="${WEB_PORT:-5173}"
WORKER_HOST="${WORKER_HOST:-127.0.0.1}"
WORKER_PORT="${WORKER_PORT:-8787}"
WORKER_INSPECTOR_PORT="${WORKER_INSPECTOR_PORT:-9229}"
WAIT_FOR_READY="${WAIT_FOR_READY:-1}"
AUTO_REFRESH_LOCAL_DATA="${AUTO_REFRESH_LOCAL_DATA:-1}"

WORKER_URL="http://${WORKER_HOST}:${WORKER_PORT}/health"
WEB_URL="http://${WEB_HOST}:${WEB_PORT}"

cleanup() {
  if [[ -n "${WORKER_PID:-}" ]] && kill -0 "$WORKER_PID" 2>/dev/null; then
    kill "$WORKER_PID" || true
  fi
  if [[ -n "${WEB_PID:-}" ]] && kill -0 "$WEB_PID" 2>/dev/null; then
    kill "$WEB_PID" || true
  fi
}

trap cleanup EXIT INT TERM

kill_port "${WORKER_PORT}"
kill_port "${WEB_PORT}"
kill_port "${WORKER_INSPECTOR_PORT}"

echo "Starting unified worker on ${WORKER_HOST}:${WORKER_PORT}..."
npm --prefix "${ROOT_DIR}/workers/senate_data_worker" run dev -- --ip "${WORKER_HOST}" --port "${WORKER_PORT}" --inspector-port "${WORKER_INSPECTOR_PORT}" &
WORKER_PID=$!

echo "Starting web on ${WEB_HOST}:${WEB_PORT}..."
npm --prefix "${ROOT_DIR}/web" run dev -- --host "${WEB_HOST}" --port "${WEB_PORT}" &
WEB_PID=$!

if [[ "$WAIT_FOR_READY" == "1" ]]; then
  wait_for_url "$WORKER_URL" "worker" 60
  wait_for_url "$WEB_URL" "web" 60
fi

if [[ "$AUTO_REFRESH_LOCAL_DATA" == "1" ]]; then
  echo "Checking whether local vote data needs ingestion…"
  export API_URL="${API_URL:-http://${WORKER_HOST}:${WORKER_PORT}}"
  export PIPELINE_URL="${PIPELINE_URL:-http://${WORKER_HOST}:${WORKER_PORT}}"
  if node "${ROOT_DIR}/scripts/ensure-fresh-local-data.mjs"; then
    echo "✅ Local data ready for the web app"
  else
    echo "⚠️  Auto-ingestion did not produce a briefing yet; check API keys in workers/senate_data_worker/.dev.vars and trigger ${PIPELINE_URL%/}/__pipeline/run/ingestion" >&2
  fi
fi

wait "$WORKER_PID" "$WEB_PID"
