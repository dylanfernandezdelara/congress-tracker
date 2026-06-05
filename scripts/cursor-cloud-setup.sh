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

echo "Installing Playwright Chromium (for npm test and optional npm run snapshot)..."
npm --prefix "${WEB_DIR}" exec -- playwright install --with-deps chromium

if [[ ! -f "${DEV_VARS}" ]]; then
  echo "Creating ${DEV_VARS} from example..."
  cp "${DEV_VARS_EXAMPLE}" "${DEV_VARS}"
fi

# `wrangler dev` reads [vars] from wrangler.toml and the `.dev.vars` file; it
# does NOT inject the shell's process.env into the Worker's bindings. Cursor
# Cloud, however, exposes Secrets dashboard values as process.env. Bridge those
# (and any locally exported overrides) into `.dev.vars` so the same secrets work
# seamlessly in local dev and on Cursor Cloud without editing this file by hand.
upsert_dev_var() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp)"
  grep -vE "^${key}=" "${DEV_VARS}" >"${tmp}" 2>/dev/null || true
  printf '%s=%s\n' "${key}" "${value}" >>"${tmp}"
  mv "${tmp}" "${DEV_VARS}"
}

BRIDGED_VARS=(
  DATA_SOURCE
  REPLAY_FIXTURE_SET
  CLOCK
  ALLOWED_ORIGIN
  CONGRESS_API_KEY
  GOVINFO_API_KEY
  PIPELINE_ADMIN_TOKEN
)

for var in "${BRIDGED_VARS[@]}"; do
  if [[ -n "${!var:-}" ]]; then
    upsert_dev_var "${var}" "${!var}"
    echo "  bridged ${var} from environment into .dev.vars"
  fi
done

echo "Cursor Cloud setup complete."
