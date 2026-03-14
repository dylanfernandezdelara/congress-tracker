#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=/dev/null
source "${ROOT_DIR}/scripts/harness-env.sh"

STACK_STDOUT="${HARNESS_LOG_DIR}/stack.stdout.log"

cleanup() {
  if [[ -n "${STACK_PID:-}" ]] && kill -0 "${STACK_PID}" 2>/dev/null; then
    kill "${STACK_PID}" || true
    wait "${STACK_PID}" || true
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
  for log_file in "${HARNESS_LOG_DIR}/api.log" "${HARNESS_LOG_DIR}/pipeline.log" "${HARNESS_LOG_DIR}/web.log" "${STACK_STDOUT}"; do
    if [[ -f "${log_file}" ]]; then
      echo "--- ${log_file}"
      tail -n 200 "${log_file}" || true
    fi
  done
}

trap cleanup EXIT INT TERM

mkdir -p "${HARNESS_LOG_DIR}"
mkdir -p "${HARNESS_ASSERT_DIR}"
"${ROOT_DIR}/scripts/harness-stack.sh" >"${STACK_STDOUT}" 2>&1 &
STACK_PID=$!

wait_for_url "${HARNESS_API_URL}/health" "API worker"
wait_for_url "${HARNESS_PIPELINE_URL}/health" "Pipeline worker"
wait_for_url "${HARNESS_WEB_URL}" "Web app"

echo "Triggering deterministic scheduled ingestion..."
if ! curl -fsS --max-time "${HARNESS_INGEST_MAX_TIME}" "${HARNESS_PIPELINE_URL}/__pipeline/run/ingestion" \
  >"${HARNESS_ASSERT_DIR}/ingestion-response.json"; then
  print_logs
  exit 1
fi

if ! npm run harness:assert; then
  print_logs
  exit 1
fi

if ! npm run harness:browser; then
  print_logs
  exit 1
fi

echo "Harness CI run passed."
