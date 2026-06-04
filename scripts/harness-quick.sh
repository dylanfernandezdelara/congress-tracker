#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=/dev/null
source "${ROOT_DIR}/scripts/harness-env.sh"
# shellcheck source=/dev/null
source "${ROOT_DIR}/scripts/lib/harness.sh"

WORKER_PID=""

cleanup() {
  harness_stop_pid "${WORKER_PID}"
  harness_kill_api_ports
}

trap cleanup EXIT INT TERM

harness_prepare_dirs
harness_kill_api_ports

harness_start_worker "Starting unified worker (replay) on ${HARNESS_HOST}:${HARNESS_API_PORT}"
WORKER_PID="${HARNESS_STARTED_WORKER_PID}"

if ! harness_wait_for_worker 1; then
  exit 1
fi

if ! harness_trigger_ingestion; then
  harness_print_log_tail "${HARNESS_WORKER_LOG}"
  exit 1
fi

if ! npm run harness:assert; then
  harness_print_log_tail "${HARNESS_WORKER_LOG}"
  exit 1
fi

echo "Harness quick run passed."
