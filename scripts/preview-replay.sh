#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=/dev/null
source "${ROOT_DIR}/scripts/harness-env.sh"

export HARNESS_ROOT="${HARNESS_PREVIEW_ROOT}"
export HARNESS_STATE_DIR="${HARNESS_ROOT}/wrangler-state"
export HARNESS_LOG_DIR="${HARNESS_ROOT}/logs"
export HARNESS_ASSERT_DIR="${HARNESS_ROOT}/assertions"

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

harness_urlencode() {
  node -e "console.log(encodeURIComponent(process.argv[1]))" "$1"
}

mkdir -p "${HARNESS_ROOT}"

if ! harness_bootstrap_replay_stack \
  "Starting replay worker for preview on ${HARNESS_HOST}:${HARNESS_API_PORT}" \
  before-web \
  1; then
  print_logs
  exit 1
fi

WORKER_PID="${HARNESS_STARTED_WORKER_PID}"
WEB_PID="${HARNESS_STARTED_WEB_PID}"

HARNESS_NOW_PARAM="harness_now=$(harness_urlencode "${CLOCK}")"
HOMEPAGE_PATH="/?${HARNESS_NOW_PARAM}"

cat <<EOF

Replay preview is ready (Ctrl+C to stop).

Web app:  ${HARNESS_WEB_URL}
Worker:   ${HARNESS_API_URL}

Suggested UI routes:
  ${HARNESS_WEB_URL}${HOMEPAGE_PATH}
  ${HARNESS_WEB_URL}${HARNESS_EXPECTED_VOTE_DETAIL_PATH}

Canonical API checks (already asserted):
  ${HARNESS_API_URL}/briefings/latest.json
  ${HARNESS_API_URL}${HARNESS_EXPECTED_VOTE_DETAIL_API_PATH}

Artifacts: ${HARNESS_ROOT}/ (logs, assertions, wrangler-state; not committed)

Capture screenshots with Cursor Cloud browser tooling — do not commit PNGs under docs/.

EOF

wait "${WORKER_PID}" "${WEB_PID}"
