#!/usr/bin/env bash
set -euo pipefail

PIPELINE_HOST="${PIPELINE_HOST:-127.0.0.1}"
PIPELINE_PORT="${PIPELINE_PORT:-8788}"
PIPELINE_URL="${PIPELINE_URL:-http://${PIPELINE_HOST}:${PIPELINE_PORT}}"
START_CONGRESS="${START_CONGRESS:-119}"
END_CONGRESS="${END_CONGRESS:-101}"
SESSION_FILTER="${SESSION_FILTER:-all}"

run_backfill() {
  local congress="$1"
  local session="$2"
  local url="${PIPELINE_URL}/__pipeline/run/historical-backfill?congress=${congress}"
  if [[ "${session}" != "all" ]]; then
    url="${url}&session=${session}"
  fi

  echo "Backfilling congress ${congress}${session:+ session ${session}}..."
  curl -fsS "${url}"
  echo
}

if [[ "${SESSION_FILTER}" != "all" && "${SESSION_FILTER}" != "1" && "${SESSION_FILTER}" != "2" ]]; then
  echo "SESSION_FILTER must be all, 1, or 2" >&2
  exit 1
fi

for ((congress=START_CONGRESS; congress>=END_CONGRESS; congress--)); do
  if [[ "${SESSION_FILTER}" == "all" ]]; then
    run_backfill "${congress}" "1"
    run_backfill "${congress}" "2"
  else
    run_backfill "${congress}" "${SESSION_FILTER}"
  fi
done
