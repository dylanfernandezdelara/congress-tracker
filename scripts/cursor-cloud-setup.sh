#!/usr/bin/env bash
# Idempotent bootstrap for Cursor Cloud agents (also safe to run locally).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER_DIR="${ROOT_DIR}/workers/senate_data_worker"
WEB_DIR="${ROOT_DIR}/web"
DEV_VARS="${WORKER_DIR}/.dev.vars"
DEV_VARS_EXAMPLE="${WORKER_DIR}/.dev.vars.example"
BRIDGED_STATE="${DEV_VARS}.bridged"

# shellcheck source=scripts/lib/dev-vars.sh
source "${ROOT_DIR}/scripts/lib/dev-vars.sh"

echo "Installing worker dependencies..."
npm --prefix "${WORKER_DIR}" ci

echo "Installing web dependencies..."
npm --prefix "${WEB_DIR}" ci

echo "Installing Playwright Chromium (for npm test and optional npm run snapshot)..."
npm --prefix "${WEB_DIR}" exec -- playwright install --with-deps chromium

if [[ ! -s "${DEV_VARS}" ]]; then
  echo "Creating ${DEV_VARS} from example..."
  cp "${DEV_VARS_EXAMPLE}" "${DEV_VARS}"
fi

chmod 600 "${DEV_VARS}" 2>/dev/null || true

# `wrangler dev` reads [vars] from wrangler.toml and the `.dev.vars` file; it
# does NOT inject the shell's process.env into the Worker's bindings. Cursor
# Cloud, however, exposes Secrets dashboard values as process.env. Bridge those
# (and any locally exported overrides) into `.dev.vars` so the same secrets work
# seamlessly in local dev and on Cursor Cloud without editing this file by hand.
#
# Bridging is upsert-only for keys set in the environment. Keys previously
# bridged from env are removed when cleared in the environment (tracked in
# `.dev.vars.bridged`); hand-edited lines for keys never bridged are preserved.
# To fully reset, delete `.dev.vars` and `.dev.vars.bridged`, then re-run.

bridged_count="$(bridge_dev_vars_from_env "${DEV_VARS}" "${BRIDGED_STATE}")"
if [[ "${bridged_count}" -gt 0 ]]; then
  if [[ -n "${CURSOR_SETUP_VERBOSE:-}" ]]; then
    while IFS= read -r var; do
      [[ -n "${var}" ]] && echo "  bridged ${var} from environment into .dev.vars"
    done < <(read_bridged_state "${BRIDGED_STATE}")
  else
    echo "  bridged ${bridged_count} var(s) from environment into .dev.vars"
  fi
fi

echo "Cursor Cloud setup complete."
