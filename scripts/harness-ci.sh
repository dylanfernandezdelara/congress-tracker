#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=/dev/null
source "${ROOT_DIR}/scripts/harness-env.sh"
# shellcheck source=/dev/null
source "${ROOT_DIR}/scripts/lib/harness.sh"

WORKER_PID=""
WEB_PID=""

cleanup() {
  harness_stop_pid "${WEB_PID}"
  harness_stop_pid "${WORKER_PID}"
  harness_kill_web_port
  harness_kill_api_ports
}

print_logs() {
  harness_print_logs "${HARNESS_WORKER_LOG}" "${HARNESS_WEB_LOG}"
}

trap cleanup EXIT INT TERM

harness_prepare_dirs
harness_kill_api_ports
harness_kill_web_port

# Single unified worker: one `wrangler dev` over one --persist-to path. No concurrent
# Miniflare D1 access, so the previous sequential two-phase start is no longer needed.
harness_start_worker "Starting unified worker (fetch + scheduled + queue) on ${HARNESS_HOST}:${HARNESS_API_PORT}"
WORKER_PID="${HARNESS_STARTED_WORKER_PID}"

if ! harness_wait_for_worker 0; then
  exit 1
fi

if ! harness_trigger_ingestion; then
  print_logs
  exit 1
fi

echo "Starting web app on ${HARNESS_HOST}:${HARNESS_WEB_PORT}"
VITE_API_URL="${HARNESS_API_URL}" \
  npm --prefix "${ROOT_DIR}/web" run dev -- \
    --host "${HARNESS_HOST}" \
    --port "${HARNESS_WEB_PORT}" \
    >"${HARNESS_WEB_LOG}" 2>&1 &
WEB_PID=$!

wait_for_url "${HARNESS_WEB_URL}" "Web app"

if ! node "${ROOT_DIR}/scripts/harness-assert.mjs"; then
  print_logs
  exit 1
fi

if ! npm --prefix "${ROOT_DIR}/web" exec -- playwright test --config "${ROOT_DIR}/web/playwright.harness.config.ts"; then
  print_logs
  exit 1
fi

echo "Deterministic test harness passed."
