#!/usr/bin/env bash
# Idempotent bootstrap for Cursor Cloud agents (also safe to run locally).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER_DIR="${ROOT_DIR}/workers/senate_data_worker"
WEB_DIR="${ROOT_DIR}/web"
DEV_VARS="${WORKER_DIR}/.dev.vars"
DEV_VARS_EXAMPLE="${WORKER_DIR}/.dev.vars.example"

echo "Installing root dependencies (viewport QA tooling)..."
npm --prefix "${ROOT_DIR}" ci

echo "Installing worker dependencies..."
npm --prefix "${WORKER_DIR}" ci

echo "Installing web dependencies..."
npm --prefix "${WEB_DIR}" ci

echo "Installing Playwright Chromium for viewport QA..."
npx --prefix "${ROOT_DIR}" playwright install chromium

if ! command -v lsof >/dev/null 2>&1; then
  echo "warning: lsof is not installed; the verify-congress-tracker skill needs it to check ports." >&2
fi

if [[ ! -f "${DEV_VARS}" ]]; then
  echo "Creating ${DEV_VARS} from example..."
  cp "${DEV_VARS_EXAMPLE}" "${DEV_VARS}"
fi

chmod 600 "${DEV_VARS}" 2>/dev/null || true

echo "Cursor Cloud setup complete."
