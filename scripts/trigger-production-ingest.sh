#!/usr/bin/env bash
# Trigger production feed ingest via the admin pipeline route.
#
# Required env:
#   PIPELINE_ADMIN_TOKEN — same value as `wrangler secret put PIPELINE_ADMIN_TOKEN`
#
# Optional env:
#   WORKER_URL — defaults to production workers.dev URL below
#
# Example:
#   PIPELINE_ADMIN_TOKEN='…' ./scripts/trigger-production-ingest.sh

set -euo pipefail

DEFAULT_WORKER_URL="https://congress-tracker-api.fernandezdelaradylan.workers.dev"
TARGET_URL="${WORKER_URL:-$DEFAULT_WORKER_URL}"

if [[ -z "${PIPELINE_ADMIN_TOKEN:-}" ]]; then
  echo "PIPELINE_ADMIN_TOKEN is required." >&2
  echo "Set it to the same value configured on the Worker secret." >&2
  exit 1
fi

echo "Triggering feed ingest at ${TARGET_URL}/__pipeline/run/feed …"

response="$(curl -fsS --max-time 600 \
  -X POST \
  -H "Authorization: Bearer ${PIPELINE_ADMIN_TOKEN}" \
  "${TARGET_URL}/__pipeline/run/feed")"

echo "${response}"

echo
echo "Check freshness:"
curl -fsS "${TARGET_URL}/health" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(JSON.stringify(d.data ?? d, null, 2));"
