#!/usr/bin/env bash
# Idempotent bootstrap for Cursor Cloud agents (also safe to run locally).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER_DIR="${ROOT_DIR}/workers/senate_data_worker"
WEB_DIR="${ROOT_DIR}/web"
DEV_VARS="${WORKER_DIR}/.dev.vars"
DEV_VARS_EXAMPLE="${WORKER_DIR}/.dev.vars.example"

echo "Installing worker dependencies..."
npm --prefix "${WORKER_DIR}" ci

echo "Installing web dependencies..."
npm --prefix "${WEB_DIR}" ci

echo "Installing Playwright Chromium (for harness:ci / harness:browser)..."
npm --prefix "${WEB_DIR}" exec -- playwright install --with-deps chromium

if [[ ! -f "${DEV_VARS}" ]]; then
  echo "Creating ${DEV_VARS} from example..."
  cp "${DEV_VARS_EXAMPLE}" "${DEV_VARS}"
fi

# Local Vite (:5173) must reach the API worker (:8787). harness-ci.sh also passes
# --var ALLOWED_ORIGIN:*, but dev-all.sh reads .dev.vars directly.
ensure_allowed_origin() {
  local file="$1"
  awk '
    BEGIN { replaced = 0 }
    /^ALLOWED_ORIGIN=/ { print "ALLOWED_ORIGIN=*"; replaced = 1; next }
    { print }
    END { if (!replaced) print "ALLOWED_ORIGIN=*" }
  ' "${file}" > "${file}.tmp"
  mv "${file}.tmp" "${file}"
}

ensure_allowed_origin "${DEV_VARS}"

echo "Cursor Cloud setup complete."
