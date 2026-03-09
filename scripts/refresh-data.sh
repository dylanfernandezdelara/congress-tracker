#!/usr/bin/env bash
set -euo pipefail

WORKER_HOST="${PIPELINE_HOST:-127.0.0.1}"
WORKER_PORT="${PIPELINE_PORT:-8788}"
WORKER_URL="${WORKER_URL:-http://${WORKER_HOST}:${WORKER_PORT}}"

PRIMARY_ENDPOINT="${WORKER_URL}/__pipeline/run/ingestion"
SECONDARY_ENDPOINT="${WORKER_URL}/__scheduled"
FALLBACK_ENDPOINT="${WORKER_URL}/cdn-cgi/handler/scheduled"

echo "Triggering scheduled ingestion..."
if curl -fsS "${PRIMARY_ENDPOINT}" >/dev/null; then
  echo "Triggered via ${PRIMARY_ENDPOINT}"
elif curl -fsS "${SECONDARY_ENDPOINT}" >/dev/null; then
  echo "Triggered via ${SECONDARY_ENDPOINT}"
elif curl -fsS "${FALLBACK_ENDPOINT}" >/dev/null; then
  echo "Triggered via ${FALLBACK_ENDPOINT}"
else
  echo "Failed to trigger scheduled ingestion at either endpoint."
  echo "Tried:"
  echo "  - ${PRIMARY_ENDPOINT}"
  echo "  - ${SECONDARY_ENDPOINT}"
  echo "  - ${FALLBACK_ENDPOINT}"
  exit 1
fi
