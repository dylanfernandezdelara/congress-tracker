#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=/dev/null
source "${ROOT_DIR}/scripts/harness-env.sh"
# shellcheck source=/dev/null
source "${ROOT_DIR}/scripts/lib/proc.sh"

WORKER_LOG="${HARNESS_LOG_DIR}/worker.log"
WORKER_PID=""

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

print_worker_log_tail() {
  if [[ -f "${WORKER_LOG}" ]]; then
    echo "--- ${WORKER_LOG}"
    tail -n 200 "${WORKER_LOG}" || true
  fi
}

cleanup() {
  harness_stop_pid "${WORKER_PID}"
  kill_port "${HARNESS_API_PORT}"
  kill_port "${HARNESS_API_INSPECTOR_PORT}"
}

trap cleanup EXIT INT TERM

mkdir -p "${HARNESS_LOG_DIR}" "${HARNESS_ASSERT_DIR}"
rm -rf "${HARNESS_STATE_DIR}"
mkdir -p "${HARNESS_STATE_DIR}"

kill_port "${HARNESS_API_PORT}"
kill_port "${HARNESS_API_INSPECTOR_PORT}"

echo "Starting unified worker (replay) on ${HARNESS_HOST}:${HARNESS_API_PORT}"
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
  --var "ALLOWED_ORIGIN:*" \
  >"${WORKER_LOG}" 2>&1 &
WORKER_PID=$!

if ! wait_for_url "${HARNESS_API_URL}/health" "Worker"; then
  print_worker_log_tail
  exit 1
fi

echo "Triggering deterministic scheduled ingestion..."
if ! curl -fsS --max-time "${HARNESS_INGEST_MAX_TIME}" "${HARNESS_PIPELINE_URL}/__pipeline/run/ingestion" \
  >"${HARNESS_ASSERT_DIR}/ingestion-response.json"; then
  print_worker_log_tail
  exit 1
fi

if ! npm run harness:assert; then
  print_worker_log_tail
  exit 1
fi

echo "Harness quick run passed."
