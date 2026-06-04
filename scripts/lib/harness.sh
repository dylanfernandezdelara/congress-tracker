# Shared harness helpers for harness-ci.sh.
# Source after scripts/harness-env.sh (ROOT_DIR must be set). This file sources proc.sh.
# Safe to source multiple times; do not enable errexit here.

if [[ -n "${_HARNESS_LIB_HARNESS_SH:-}" ]]; then
  return 0 2>/dev/null || true
fi
_HARNESS_LIB_HARNESS_SH=1

if [[ -z "${ROOT_DIR:-}" ]]; then
  echo "harness.sh: ROOT_DIR is unset; source harness-env.sh (or set ROOT_DIR) before harness.sh" >&2
  exit 1
fi

if [[ -z "${_PROC_LIB_PROC_SH:-}" ]]; then
  # shellcheck source=/dev/null
  source "${ROOT_DIR}/scripts/lib/proc.sh"
fi

HARNESS_WORKER_LOG="${HARNESS_LOG_DIR}/worker.log"
HARNESS_WEB_LOG="${HARNESS_LOG_DIR}/web.log"

# Wrangler/Vite often ignore SIGTERM briefly or leave children alive; unbounded `wait` on EXIT
# makes harness runs look "stuck" after tests pass. Use bounded teardown + port cleanup.
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

harness_print_log_tail() {
  local log_file="$1"
  if [[ -f "${log_file}" ]]; then
    echo "--- ${log_file}"
    tail -n 200 "${log_file}" || true
  fi
}

harness_print_logs() {
  local log_file
  for log_file in "$@"; do
    harness_print_log_tail "${log_file}"
  done
}

harness_prepare_dirs() {
  mkdir -p "${HARNESS_LOG_DIR}" "${HARNESS_ASSERT_DIR}"
  rm -rf "${HARNESS_STATE_DIR}"
  mkdir -p "${HARNESS_STATE_DIR}"
}

harness_kill_api_ports() {
  kill_port "${HARNESS_API_PORT}"
  kill_port "${HARNESS_API_INSPECTOR_PORT}"
}

harness_kill_web_port() {
  kill_port "${HARNESS_WEB_PORT}"
}

# Starts the unified replay worker; sets HARNESS_STARTED_WORKER_PID for callers to copy.
harness_start_worker() {
  local start_message="$1"
  echo "${start_message}"
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
    >"${HARNESS_WORKER_LOG}" 2>&1 &
  HARNESS_STARTED_WORKER_PID=$!
}

harness_wait_for_worker() {
  local print_logs_on_fail="${1:-0}"
  if ! wait_for_url "${HARNESS_API_URL}/health" "Worker"; then
    if [[ "${print_logs_on_fail}" == "1" ]]; then
      harness_print_log_tail "${HARNESS_WORKER_LOG}"
    fi
    return 1
  fi
}

harness_trigger_ingestion() {
  echo "Triggering deterministic scheduled ingestion..."
  curl -fsS --max-time "${HARNESS_INGEST_MAX_TIME}" "${HARNESS_PIPELINE_URL}/__pipeline/run/ingestion" \
    >"${HARNESS_ASSERT_DIR}/ingestion-response.json"
}
