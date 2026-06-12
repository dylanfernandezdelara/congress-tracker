#!/usr/bin/env bash
# Preflight check for local development parity with Cursor Cloud.
#
# Confirms the things Cursor Cloud sets up automatically are also present
# locally: Node toolchain, installed dependencies, and a .dev.vars file. If the
# worker is already running it also probes /health and the feed, and nudges you
# to `npm run seed` when the local feed is empty.
#
# Exits non-zero only when a hard requirement (Node, dependencies) is missing,
# so it is safe to run before starting the dev servers.
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER_DIR="${ROOT_DIR}/workers/senate_data_worker"
WEB_DIR="${ROOT_DIR}/web"
DEV_VARS="${WORKER_DIR}/.dev.vars"
WORKER_URL="${WORKER_URL:-http://127.0.0.1:8787}"

PASS="ok"
WARN="warn"
FAIL="FAIL"
hard_failure=0

status() {
  # $1 = level, $2 = message
  printf '  [%s] %s\n' "$1" "$2"
}

echo "Verifying local development environment..."

# --- Node toolchain -------------------------------------------------------
if command -v node >/dev/null 2>&1; then
  node_version="$(node -v)"
  node_major="$(printf '%s' "${node_version}" | sed -E 's/^v([0-9]+).*/\1/')"
  expected_major=""
  if [[ -f "${ROOT_DIR}/.nvmrc" ]]; then
    expected_major="$(sed -E 's/^v?([0-9]+).*/\1/' "${ROOT_DIR}/.nvmrc" | head -n1)"
  fi
  if [[ -n "${expected_major}" && "${node_major}" != "${expected_major}" ]]; then
    status "${WARN}" "Node ${node_version} (.nvmrc pins ${expected_major}; CI uses ${expected_major}). Consider 'nvm use'."
  else
    status "${PASS}" "Node ${node_version}"
  fi
else
  status "${FAIL}" "Node.js not found on PATH."
  hard_failure=1
fi

# --- Dependencies ---------------------------------------------------------
check_deps() {
  # $1 = label, $2 = dir
  if [[ -d "$2/node_modules" ]]; then
    status "${PASS}" "$1 dependencies installed"
  else
    status "${FAIL}" "$1 dependencies missing — run 'npm run setup'"
    hard_failure=1
  fi
}
check_deps "root" "${ROOT_DIR}"
check_deps "worker" "${WORKER_DIR}"
check_deps "web" "${WEB_DIR}"

# --- Local secrets --------------------------------------------------------
if [[ -f "${DEV_VARS}" ]]; then
  status "${PASS}" ".dev.vars present"
  if ! grep -Eq '^CONGRESS_API_KEY=.+' "${DEV_VARS}" 2>/dev/null; then
    status "${WARN}" "CONGRESS_API_KEY not set — live ingestion will be limited; use 'npm run seed' for offline data."
  fi
  if ! grep -Eq '^OPENROUTER_API_KEY=.+' "${DEV_VARS}" 2>/dev/null; then
    status "${WARN}" "OPENROUTER_API_KEY not set — digests will not be rewritten; 'npm run seed' provides sample digests."
  fi
else
  status "${WARN}" ".dev.vars missing — run 'npm run setup' (copies the example; offline 'npm run seed' still works)."
fi

# --- Optional: probe a running worker -------------------------------------
if command -v curl >/dev/null 2>&1; then
  if curl -fsS --max-time 2 "${WORKER_URL}/health" >/dev/null 2>&1; then
    status "${PASS}" "Worker reachable at ${WORKER_URL}"
    feed_json="$(curl -fsS --max-time 4 "${WORKER_URL}/feed/latest.json" 2>/dev/null || true)"
    if [[ "${feed_json}" == "["*"]" && "${feed_json}" != "[]" ]]; then
      status "${PASS}" "Feed has data"
    else
      status "${WARN}" "Feed is empty — run 'npm run seed' (offline) or curl ${WORKER_URL}/__pipeline/run/feed (needs API keys)."
    fi
  else
    status "${WARN}" "Worker not running at ${WORKER_URL} — start it with 'npm run dev:worker' (optional check)."
  fi
fi

echo ""
if [[ "${hard_failure}" -ne 0 ]]; then
  echo "Local environment is NOT ready. Resolve the [${FAIL}] items above (usually 'npm run setup')."
  exit 1
fi
echo "Local environment looks ready. Two terminals: 'npm run dev:worker' and 'npm run dev:web'."
echo "See docs/LOCAL_DEVELOPMENT.md for the full local <-> Cursor Cloud parity guide."
