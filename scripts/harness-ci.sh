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

if ! harness_bootstrap_replay_stack \
  "Starting unified worker (fetch + scheduled + queue) on ${HARNESS_HOST}:${HARNESS_API_PORT}" \
  after-web \
  1; then
  print_logs
  exit 1
fi

WORKER_PID="${HARNESS_STARTED_WORKER_PID}"
WEB_PID="${HARNESS_STARTED_WEB_PID}"

if ! npm --prefix "${ROOT_DIR}/web" exec -- playwright test --config "${ROOT_DIR}/web/playwright.harness.config.ts"; then
  print_logs
  exit 1
fi

echo "Deterministic test harness passed."
