#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=/dev/null
source "${ROOT_DIR}/scripts/harness-env.sh"

export HARNESS_ROOT="${HARNESS_SCREENSHOT_ROOT}"
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

mkdir -p "${HARNESS_SCREENSHOT_ROOT}"
rm -f "${HARNESS_REPLAY_SCREENSHOT_HOMEPAGE_PATH}" "${HARNESS_REPLAY_SCREENSHOT_VOTE_DETAIL_PATH}"

if ! harness_bootstrap_replay_stack \
  "Starting replay worker for screenshots on ${HARNESS_HOST}:${HARNESS_API_PORT}" \
  before-web \
  1; then
  print_logs
  exit 1
fi

WORKER_PID="${HARNESS_STARTED_WORKER_PID}"
WEB_PID="${HARNESS_STARTED_WEB_PID}"

HARNESS_NOW_PARAM="harness_now=$(harness_urlencode "${CLOCK}")"
HOMEPAGE_PATH="/?${HARNESS_NOW_PARAM}"
VOTE_DETAIL_PATH="${HARNESS_EXPECTED_VOTE_DETAIL_PATH}"

VIEWPORT_WIDTH="${SCREENSHOT_VIEWPORT_WIDTH:-390}"
VIEWPORT_HEIGHT="${SCREENSHOT_VIEWPORT_HEIGHT:-844}"

run_mobile_snapshot() {
  local out_path="$1"
  local page_path="$2"
  URL="${HARNESS_WEB_URL}" \
    OUT="${out_path}" \
    PATHS="${page_path}" \
    VIEWPORT_WIDTH="${VIEWPORT_WIDTH}" \
    VIEWPORT_HEIGHT="${VIEWPORT_HEIGHT}" \
    WAIT_UNTIL="${SCREENSHOT_WAIT_UNTIL:-load}" \
    SETTLE_MS="${SCREENSHOT_SETTLE_MS:-2000}" \
    ASSERT_TEXT="${HARNESS_EXPECTED_VOTE_TITLE}" \
    npm --prefix "${ROOT_DIR}/web" run ui:snap
}

if ! run_mobile_snapshot "${HARNESS_REPLAY_SCREENSHOT_HOMEPAGE_PATH}" "${HOMEPAGE_PATH}"; then
  print_logs
  exit 1
fi

if ! run_mobile_snapshot "${HARNESS_REPLAY_SCREENSHOT_VOTE_DETAIL_PATH}" "${VOTE_DETAIL_PATH}"; then
  print_logs
  exit 1
fi

for required in "${HARNESS_REPLAY_SCREENSHOT_HOMEPAGE_PATH}" "${HARNESS_REPLAY_SCREENSHOT_VOTE_DETAIL_PATH}"; do
  if [[ ! -s "${required}" ]]; then
    echo "Expected screenshot missing or empty: ${required}" >&2
    print_logs
    exit 1
  fi
done

echo "Replay screenshots written:"
echo "  ${HARNESS_REPLAY_SCREENSHOT_HOMEPAGE_PATH}"
echo "  ${HARNESS_REPLAY_SCREENSHOT_VOTE_DETAIL_PATH}"
