#!/usr/bin/env bash
# Trigger an ingestion on the DEPLOYED pipeline worker. This is the hook that
# agents (and humans) call when they want fresh data to appear in production
# R2/D1 immediately, instead of waiting for the next nightly cron.
#
# Required env (put these in .env.remote):
#   DEPLOYED_PIPELINE_URL   - https URL of the deployed pipeline worker
#                             e.g. https://senate-data-pipeline-worker.<account>.workers.dev
#   PIPELINE_ADMIN_TOKEN    - bearer token configured on the deployed worker
#                             (set via `wrangler secret put PIPELINE_ADMIN_TOKEN`)
#
# Optional env:
#   REFRESH_MAX_TIME        - curl --max-time, defaults to 600s
#   MATERIALIZE_AFTER       - "1" (default) to also POST /__pipeline/run/materialize

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -f "${ROOT_DIR}/.env.remote" ]]; then
  # shellcheck disable=SC1091
  set -a; source "${ROOT_DIR}/.env.remote"; set +a
fi

DEPLOYED_PIPELINE_URL="${DEPLOYED_PIPELINE_URL:-}"
PIPELINE_ADMIN_TOKEN="${PIPELINE_ADMIN_TOKEN:-}"
REFRESH_MAX_TIME="${REFRESH_MAX_TIME:-600}"
MATERIALIZE_AFTER="${MATERIALIZE_AFTER:-1}"

if [[ -z "${DEPLOYED_PIPELINE_URL}" ]]; then
  echo "DEPLOYED_PIPELINE_URL is not set. See .env.remote.example and AGENTS.md > 'Data flow'." >&2
  exit 1
fi

if [[ -z "${PIPELINE_ADMIN_TOKEN}" ]]; then
  echo "PIPELINE_ADMIN_TOKEN is not set. This script writes to production R2/D1 and" >&2
  echo "requires the same token configured on the deployed worker." >&2
  exit 1
fi

call_endpoint() {
  local path="$1"
  local label="$2"
  echo "[refresh-remote] ${label} -> ${DEPLOYED_PIPELINE_URL}${path}"
  curl -fsS --max-time "${REFRESH_MAX_TIME}" \
    -H "Authorization: Bearer ${PIPELINE_ADMIN_TOKEN}" \
    "${DEPLOYED_PIPELINE_URL}${path}"
  echo
}

call_endpoint "/__pipeline/run/ingestion" "Triggering ingestion"

if [[ "${MATERIALIZE_AFTER}" == "1" ]]; then
  call_endpoint "/__pipeline/run/materialize" "Triggering materialization"
fi

echo "[refresh-remote] Done at $(date -u +%FT%TZ). The deployed API worker (and any" \
     "local npm run dev pointing at --remote) now reflects the latest data."
