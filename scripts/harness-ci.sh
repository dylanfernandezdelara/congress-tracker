#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=/dev/null
source "${ROOT_DIR}/scripts/harness-env.sh"

WORKER_LOG="${HARNESS_LOG_DIR}/worker.log"
WEB_LOG="${HARNESS_LOG_DIR}/web.log"

WORKER_PID=""
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
  harness_stop_pid "${WORKER_PID}"
  kill_port "${HARNESS_WEB_PORT}"
  kill_port "${HARNESS_API_PORT}"
  kill_port "${HARNESS_API_INSPECTOR_PORT}"
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
  for log_file in "${HARNESS_LOG_DIR}/worker.log" "${HARNESS_LOG_DIR}/web.log"; do
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
kill_port "${HARNESS_WEB_PORT}"
kill_port "${HARNESS_API_INSPECTOR_PORT}"

# Single unified worker: one `wrangler dev` over one --persist-to path. No concurrent
# Miniflare D1 access, so the previous sequential two-phase start is no longer needed.
echo "Starting unified worker (fetch + scheduled + queue) on ${HARNESS_HOST}:${HARNESS_API_PORT}"
npm --prefix "${ROOT_DIR}/workers/senate_data_worker" run dev -- \
  --ip "${HARNESS_HOST}" \
  --port "${HARNESS_API_PORT}" \
  --inspector-port "${HARNESS_API_INSPECTOR_PORT}" \
  --persist-to "${HARNESS_STATE_DIR}" \
  --var "DATA_SOURCE:replay" \
  --var "REPLAY_FIXTURE_SET:${REPLAY_FIXTURE_SET}" \
  --var "CLOCK:${CLOCK}" \
  --var "CONGRESS_API_KEY:HARNESS_FIXTURE_KEY" \
  --var "GOVINFO_API_KEY:HARNESS_FIXTURE_KEY" \
  --var "OPENROUTER_CANARY_PERCENT:0" \
  --var "ALLOWED_ORIGIN:*" \
  >"${WORKER_LOG}" 2>&1 &
WORKER_PID=$!

wait_for_url "${HARNESS_API_URL}/health" "Worker"

echo "Triggering deterministic scheduled ingestion..."
if ! curl -fsS --max-time "${HARNESS_INGEST_MAX_TIME}" "${HARNESS_PIPELINE_URL}/__pipeline/run/ingestion" \
  >"${HARNESS_ASSERT_DIR}/ingestion-response.json"; then
  print_logs
  exit 1
fi

echo "Starting web app on ${HARNESS_HOST}:${HARNESS_WEB_PORT}"
VITE_API_URL="${HARNESS_API_URL}" \
  npm --prefix "${ROOT_DIR}/web" run dev -- \
    --host "${HARNESS_HOST}" \
    --port "${HARNESS_WEB_PORT}" \
    >"${WEB_LOG}" 2>&1 &
WEB_PID=$!

wait_for_url "${HARNESS_WEB_URL}" "Web app"

if ! npm run harness:assert; then
  print_logs
  exit 1
fi

if ! npm run harness:browser; then
  print_logs
  exit 1
fi

echo "Harness CI run passed."
