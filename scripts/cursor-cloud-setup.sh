#!/usr/bin/env bash
# Idempotent bootstrap for Cursor Cloud agents (also safe to run locally).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER_DIR="${ROOT_DIR}/workers/senate_data_worker"
WEB_DIR="${ROOT_DIR}/web"
echo "Installing worker dependencies..."
npm --prefix "${WORKER_DIR}" ci

echo "Installing web dependencies..."
npm --prefix "${WEB_DIR}" ci

echo "Installing Playwright Chromium (for npm test and npm run snapshot)..."
npm --prefix "${WEB_DIR}" exec -- playwright install --with-deps chromium

"${ROOT_DIR}/scripts/ensure-replay-dev-vars.sh"

echo "Cursor Cloud setup complete."
