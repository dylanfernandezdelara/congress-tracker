# Shared process/port helpers for harness and local dev scripts.
# Safe to source multiple times; do not enable errexit here.

if [[ -n "${_PROC_LIB_PROC_SH:-}" ]]; then
  return 0 2>/dev/null || true
fi
_PROC_LIB_PROC_SH=1

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
