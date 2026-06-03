#!/usr/bin/env bash
set -euo pipefail

CONFIG_PATH="${CONFIG_PATH:-wrangler.toml}"
PORT="${PORT:-8787}"
INSPECTOR_PORT="${INSPECTOR_PORT:-9231}"
HOST="${HOST:-127.0.0.1}"
LOG_PATH="${LOG_PATH:-/tmp/wrangler-test-scheduled.log}"

ensure_available_port() {
  local requested_port="$1"
  local default_port="$2"
  local port_var_name="$3"
  local port_label="$4"
  shift 4
  local fallback_port

  if ! lsof -ti tcp:"${requested_port}" >/dev/null 2>&1; then
    echo "${requested_port}"
    return 0
  fi

  if [[ "${requested_port}" != "${default_port}" ]]; then
    echo "${port_label} ${requested_port} is already in use. Set ${port_var_name} to an available local port." >&2
    exit 1
  fi

  for fallback_port in "$@"; do
    if ! lsof -ti tcp:"${fallback_port}" >/dev/null 2>&1; then
      echo "${port_label} ${requested_port} is already in use. Falling back to ${fallback_port}." >&2
      echo "${fallback_port}"
      return 0
    fi
  done

  echo "Unable to find an available local ${port_label} for the scheduled smoke test." >&2
  exit 1
}

PORT="$(ensure_available_port "${PORT}" "8787" "PORT" "HTTP port" 8797 8897 8987)"
INSPECTOR_PORT="$(ensure_available_port "${INSPECTOR_PORT}" "9231" "INSPECTOR_PORT" "Inspector port" 9241 9251 9261)"
WORKER_URL="${WORKER_URL:-http://${HOST}:${PORT}}"

cd "$(dirname "$0")/.."

rm -f "$LOG_PATH"

echo "Starting wrangler dev --config ${CONFIG_PATH} --test-scheduled on ${HOST}:${PORT} (inspector ${HOST}:${INSPECTOR_PORT})..."
npx wrangler dev --config "$CONFIG_PATH" --test-scheduled --ip "$HOST" --port "$PORT" --inspector-port "$INSPECTOR_PORT" >"$LOG_PATH" 2>&1 &
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
  if rg -q '"event":"scheduled_ingestion_complete"' "$LOG_PATH"; then
    rg -n '"event":"scheduled_ingestion_complete"' "$LOG_PATH" || true
    exit 0
  fi
  if rg -q '"event":"scheduled_ingestion_failed"' "$LOG_PATH"; then
    rg -n '"event":"scheduled_ingestion_failed"' "$LOG_PATH" || true
    echo "Ingestion failed. See $LOG_PATH for details."
    exit 1
  fi
  sleep 2
done

echo "Timed out waiting for ingestion to finish. See $LOG_PATH for details."
exit 1
