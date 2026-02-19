#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_HOST="${WEB_HOST:-127.0.0.1}"
WEB_PORT="${WEB_PORT:-5173}"
WORKER_HOST="${WORKER_HOST:-127.0.0.1}"
WORKER_PORT="${WORKER_PORT:-8787}"
E2E="${E2E:-1}"
PATHS="${PATHS:-/}"
OUT_DIR="${OUT_DIR:-artifacts}"

"${ROOT_DIR}/scripts/refresh-data.sh"

URL="http://${WEB_HOST}:${WEB_PORT}"
E2E="${E2E}" PATHS="${PATHS}" OUT_DIR="${OUT_DIR}" URL="${URL}" \
  npm --prefix "${ROOT_DIR}/web" run ui:snap
