#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=/dev/null
source "${ROOT_DIR}/scripts/harness-env.sh"

API_LOG="${HARNESS_LOG_DIR}/api.log"
PIPELINE_LOG="${HARNESS_LOG_DIR}/pipeline.log"
WEB_LOG="${HARNESS_LOG_DIR}/web.log"

cleanup() {
  if [[ -n "${API_PID:-}" ]] && kill -0 "${API_PID}" 2>/dev/null; then
    kill "${API_PID}" || true
  fi
  if [[ -n "${PIPELINE_PID:-}" ]] && kill -0 "${PIPELINE_PID}" 2>/dev/null; then
    kill "${PIPELINE_PID}" || true
  fi
  if [[ -n "${WEB_PID:-}" ]] && kill -0 "${WEB_PID}" 2>/dev/null; then
    kill "${WEB_PID}" || true
  fi
}

kill_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti tcp:"${port}" 2>/dev/null || true)"
  if [[ -n "${pids}" ]]; then
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

trap cleanup EXIT INT TERM

rm -rf "${HARNESS_STATE_DIR}"
mkdir -p "${HARNESS_LOG_DIR}" "${HARNESS_ASSERT_DIR}" "${HARNESS_STATE_DIR}"

kill_port "${HARNESS_API_PORT}"
kill_port "${HARNESS_PIPELINE_PORT}"
kill_port "${HARNESS_WEB_PORT}"
kill_port "${HARNESS_API_INSPECTOR_PORT}"
kill_port "${HARNESS_PIPELINE_INSPECTOR_PORT}"

echo "Starting API worker..."
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
  >"${API_LOG}" 2>&1 &
API_PID=$!

echo "Starting pipeline worker..."
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

echo "Starting web app..."
VITE_API_URL="${HARNESS_API_URL}" \
  npm --prefix "${ROOT_DIR}/web" run dev -- \
    --host "${HARNESS_HOST}" \
    --port "${HARNESS_WEB_PORT}" \
    >"${WEB_LOG}" 2>&1 &
WEB_PID=$!

wait_for_url "${HARNESS_API_URL}/health" "API worker"
wait_for_url "${HARNESS_PIPELINE_URL}/health" "Pipeline worker"
wait_for_url "${HARNESS_WEB_URL}" "Web app"

echo "Harness stack running."
echo "Logs:"
echo "  API: ${API_LOG}"
echo "  Pipeline: ${PIPELINE_LOG}"
echo "  Web: ${WEB_LOG}"

wait "${API_PID}" "${PIPELINE_PID}" "${WEB_PID}"
