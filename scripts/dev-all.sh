#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_HOST="${WEB_HOST:-127.0.0.1}"
WEB_PORT="${WEB_PORT:-5173}"
WORKER_HOST="${WORKER_HOST:-127.0.0.1}"
WORKER_PORT="${WORKER_PORT:-8787}"
WORKER_INSPECTOR_PORT="${WORKER_INSPECTOR_PORT:-9229}"
PIPELINE_HOST="${PIPELINE_HOST:-127.0.0.1}"
PIPELINE_PORT="${PIPELINE_PORT:-8788}"
PIPELINE_INSPECTOR_PORT="${PIPELINE_INSPECTOR_PORT:-9230}"
WAIT_FOR_READY="${WAIT_FOR_READY:-1}"
AUTO_REFRESH_LOCAL_DATA="${AUTO_REFRESH_LOCAL_DATA:-1}"

WORKER_URL="http://${WORKER_HOST}:${WORKER_PORT}/health"
PIPELINE_URL="http://${PIPELINE_HOST}:${PIPELINE_PORT}/health"
WEB_URL="http://${WEB_HOST}:${WEB_PORT}"

cleanup() {
  if [[ -n "${WORKER_PID:-}" ]] && kill -0 "$WORKER_PID" 2>/dev/null; then
    kill "$WORKER_PID" || true
  fi
  if [[ -n "${PIPELINE_PID:-}" ]] && kill -0 "$PIPELINE_PID" 2>/dev/null; then
    kill "$PIPELINE_PID" || true
  fi
  if [[ -n "${WEB_PID:-}" ]] && kill -0 "$WEB_PID" 2>/dev/null; then
    kill "$WEB_PID" || true
  fi
}

kill_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti tcp:"${port}" 2>/dev/null || true)"
  if [[ -n "${pids}" ]]; then
    echo "Port ${port} already in use. Stopping existing process..."
    kill ${pids} 2>/dev/null || true
    sleep 0.5
  fi
}

wait_for_url() {
  local url="$1"
  local label="$2"
  local attempts=60
  local delay=0.5

  echo "Waiting for ${label} (${url})..."
  for _ in $(seq 1 "$attempts"); do
    if curl -sSf "$url" >/dev/null; then
      echo "✅ ${label} ready"
      return 0
    fi
    sleep "$delay"
  done

  echo "❌ Timed out waiting for ${label}" >&2
  return 1
}

trap cleanup EXIT INT TERM

kill_port "${WORKER_PORT}"
kill_port "${PIPELINE_PORT}"
kill_port "${WEB_PORT}"
kill_port "${WORKER_INSPECTOR_PORT}"
kill_port "${PIPELINE_INSPECTOR_PORT}"

echo "Starting API worker on ${WORKER_HOST}:${WORKER_PORT}..."
npm --prefix "${ROOT_DIR}/workers/senate_data_worker" run dev:api -- --ip "${WORKER_HOST}" --port "${WORKER_PORT}" --inspector-port "${WORKER_INSPECTOR_PORT}" &
WORKER_PID=$!

echo "Starting pipeline worker on ${PIPELINE_HOST}:${PIPELINE_PORT}..."
npm --prefix "${ROOT_DIR}/workers/senate_data_worker" run dev:pipeline -- --ip "${PIPELINE_HOST}" --port "${PIPELINE_PORT}" --inspector-port "${PIPELINE_INSPECTOR_PORT}" &
PIPELINE_PID=$!

echo "Starting web on ${WEB_HOST}:${WEB_PORT}..."
npm --prefix "${ROOT_DIR}/web" run dev -- --host "${WEB_HOST}" --port "${WEB_PORT}" &
WEB_PID=$!

if [[ "$WAIT_FOR_READY" == "1" ]]; then
  wait_for_url "$WORKER_URL" "api worker"
  wait_for_url "$PIPELINE_URL" "pipeline worker"
  wait_for_url "$WEB_URL" "web"
fi

if [[ "$AUTO_REFRESH_LOCAL_DATA" == "1" ]]; then
  echo "Checking whether local vote data needs ingestion…"
  export API_URL="${API_URL:-http://${WORKER_HOST}:${WORKER_PORT}}"
  export PIPELINE_URL="${PIPELINE_URL:-http://${PIPELINE_HOST}:${PIPELINE_PORT}}"
  if node "${ROOT_DIR}/scripts/ensure-fresh-local-data.mjs"; then
    echo "✅ Local data ready for the web app"
  else
    echo "⚠️  Auto-ingestion did not produce a briefing yet; check API keys in workers/senate_data_worker/.dev.vars and run ./scripts/refresh-data.sh" >&2
  fi
fi

wait "$WORKER_PID" "$PIPELINE_PID" "$WEB_PID"
