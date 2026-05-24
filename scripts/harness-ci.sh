#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=/dev/null
source "${ROOT_DIR}/scripts/harness-env.sh"

API_LOG="${HARNESS_LOG_DIR}/api.log"
PIPELINE_LOG="${HARNESS_LOG_DIR}/pipeline.log"
WEB_LOG="${HARNESS_LOG_DIR}/web.log"

API_PID=""
PIPELINE_PID=""
WEB_PID=""

# Wrangler/Vite often ignore SIGTERM briefly or leave children alive; unbounded `wait` on EXIT
# makes harness:ci look "stuck" after tests pass. Use bounded teardown + port cleanup.
harness_stop_pid() {
  local pid="$1"
  [[ -z "${pid}" ]] && return 0
  if ! kill -0 "${pid}" 2>/dev/null; then
    return 0
  fi
  kill -TERM "${pid}" 2>/dev/null || true
  local i=0
  while kill -0 "${pid}" 2>/dev/null && [[ "${i}" -lt 15 ]]; do
    sleep 1
    i=$((i + 1))
  done
  if kill -0 "${pid}" 2>/dev/null; then
    kill -KILL "${pid}" 2>/dev/null || true
  fi
}

cleanup() {
  harness_stop_pid "${WEB_PID}"
  harness_stop_pid "${API_PID}"
  harness_stop_pid "${PIPELINE_PID}"
  kill_port "${HARNESS_WEB_PORT}"
  kill_port "${HARNESS_API_PORT}"
  kill_port "${HARNESS_PIPELINE_PORT}"
  kill_port "${HARNESS_API_INSPECTOR_PORT}"
  kill_port "${HARNESS_PIPELINE_INSPECTOR_PORT}"
}

harness_stop_pipeline_phase() {
  echo "Stopping pipeline worker (release persistence lock before API starts)"
  harness_stop_pid "${PIPELINE_PID}"
  PIPELINE_PID=""
  sleep 1
  kill_port "${HARNESS_PIPELINE_PORT}"
  kill_port "${HARNESS_PIPELINE_INSPECTOR_PORT}"
}

kill_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti tcp:"${port}" 2>/dev/null || true)"
  if [[ -n "${pids}" ]]; then
    # shellcheck disable=SC2086
    kill ${pids} 2>/dev/null || true
    sleep 0.5
  fi
}

wait_for_url() {
  local url="$1"
  local label="$2"
  local attempts="${3:-90}"
  local delay="${4:-0.5}"

  for _ in $(seq 1 "${attempts}"); do
    if curl -fsS "${url}" >/dev/null 2>&1; then
      echo "${label} ready at ${url}"
      return 0
    fi
    sleep "${delay}"
  done

  echo "Timed out waiting for ${label} (${url})" >&2
  return 1
}

print_logs() {
  for log_file in "${HARNESS_LOG_DIR}/api.log" "${HARNESS_LOG_DIR}/pipeline.log" "${HARNESS_LOG_DIR}/web.log"; do
    if [[ -f "${log_file}" ]]; then
      echo "--- ${log_file}"
      tail -n 200 "${log_file}" || true
    fi
  done
}

trap cleanup EXIT INT TERM

mkdir -p "${HARNESS_LOG_DIR}" "${HARNESS_ASSERT_DIR}"
rm -rf "${HARNESS_STATE_DIR}"
mkdir -p "${HARNESS_STATE_DIR}"

kill_port "${HARNESS_API_PORT}"
kill_port "${HARNESS_PIPELINE_PORT}"
kill_port "${HARNESS_WEB_PORT}"
kill_port "${HARNESS_API_INSPECTOR_PORT}"
kill_port "${HARNESS_PIPELINE_INSPECTOR_PORT}"

# Two concurrent `wrangler dev` processes must not share the same --persist-to path:
# Miniflare's R2/D1 SQLite backend corrupts or throws "internal error" under concurrent access.
# Run pipeline alone for ingestion, then API + web for assertions and browser tests.

echo "Phase 1: pipeline worker (exclusive Miniflare persistence)"
npm --prefix "${ROOT_DIR}/workers/senate_data_worker" run dev:pipeline -- \
  --ip "${HARNESS_HOST}" \
  --port "${HARNESS_PIPELINE_PORT}" \
  --inspector-port "${HARNESS_PIPELINE_INSPECTOR_PORT}" \
  --persist-to "${HARNESS_STATE_DIR}" \
  --var "HARNESS_MODE:fixture" \
  --var "HARNESS_FIXTURE_SET:${HARNESS_FIXTURE_SET}" \
  --var "HARNESS_NOW:${HARNESS_NOW}" \
  --var "CONGRESS_API_KEY:HARNESS_FIXTURE_KEY" \
  --var "GOVINFO_API_KEY:HARNESS_FIXTURE_KEY" \
  --var "OPENROUTER_CANARY_PERCENT:0" \
  >"${PIPELINE_LOG}" 2>&1 &
PIPELINE_PID=$!

wait_for_url "${HARNESS_PIPELINE_URL}/health" "Pipeline worker"

echo "Triggering deterministic scheduled ingestion..."
if ! curl -fsS --max-time "${HARNESS_INGEST_MAX_TIME}" "${HARNESS_PIPELINE_URL}/__pipeline/run/ingestion" \
  >"${HARNESS_ASSERT_DIR}/ingestion-response.json"; then
  print_logs
  exit 1
fi

harness_stop_pipeline_phase

echo "Phase 2: API worker + web app (same persisted state, single wrangler at a time)"
npm --prefix "${ROOT_DIR}/workers/senate_data_worker" run dev:api -- \
  --ip "${HARNESS_HOST}" \
  --port "${HARNESS_API_PORT}" \
  --inspector-port "${HARNESS_API_INSPECTOR_PORT}" \
  --persist-to "${HARNESS_STATE_DIR}" \
  --var "HARNESS_MODE:fixture" \
  --var "HARNESS_FIXTURE_SET:${HARNESS_FIXTURE_SET}" \
  --var "HARNESS_NOW:${HARNESS_NOW}" \
  --var "CONGRESS_API_KEY:HARNESS_FIXTURE_KEY" \
  --var "GOVINFO_API_KEY:HARNESS_FIXTURE_KEY" \
  --var "OPENROUTER_CANARY_PERCENT:0" \
  --var "ALLOWED_ORIGIN:*" \
  >"${API_LOG}" 2>&1 &
API_PID=$!

wait_for_url "${HARNESS_API_URL}/health" "API worker"

VITE_API_URL="${HARNESS_API_URL}" \
  npm --prefix "${ROOT_DIR}/web" run dev -- \
    --host "${HARNESS_HOST}" \
    --port "${HARNESS_WEB_PORT}" \
    >"${WEB_LOG}" 2>&1 &
WEB_PID=$!

wait_for_url "${HARNESS_WEB_URL}" "Web app"

export HARNESS_ASSERT_SKIP_PIPELINE_STATUS=1
if ! npm run harness:assert; then
  print_logs
  exit 1
fi

if ! npm run harness:browser; then
  print_logs
  exit 1
fi

echo "Harness CI run passed."
