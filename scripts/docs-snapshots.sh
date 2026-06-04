#!/usr/bin/env bash
# Regenerate committed mobile UI screenshots (replay data, DPR=1 for smaller PNGs).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${ROOT_DIR}/docs/screenshots"
WORKER_URL="${WORKER_URL:-http://127.0.0.1:8787}"
WEB_URL="${WEB_URL:-http://localhost:5173}"

mkdir -p "${OUT_DIR}"

if curl -fsS "${WORKER_URL}/health" >/dev/null 2>&1; then
  echo "Triggering replay ingestion..."
  curl -fsS "${WORKER_URL}/__pipeline/run/ingestion" >/dev/null || true
else
  echo "Worker not reachable at ${WORKER_URL}; capture may show empty state." >&2
fi

SNAPSHOT_DPR=1 URL="${WEB_URL}" OUT_DIR="${OUT_DIR}" PATHS=/,/votes/119/2/14 \
  npm --prefix "${ROOT_DIR}/web" run ui:snap

home_src="$(find "${OUT_DIR}" -maxdepth 1 -name '*_mobile.png' ! -name 'replay-*' | head -1)"
vote_src="$(find "${OUT_DIR}" -maxdepth 1 -name '*votes_119_2_14_mobile.png' | head -1)"

if [[ -z "${home_src}" || ! -f "${home_src}" ]]; then
  echo "Missing homepage capture in ${OUT_DIR}" >&2
  exit 1
fi
if [[ -z "${vote_src}" || ! -f "${vote_src}" ]]; then
  echo "Missing vote detail capture in ${OUT_DIR}" >&2
  exit 1
fi

cp "${home_src}" "${OUT_DIR}/replay-homepage-mobile.png"
cp "${vote_src}" "${OUT_DIR}/replay-vote-detail-mobile.png"
find "${OUT_DIR}" -maxdepth 1 -name '*_mobile.png' ! -name 'replay-*' -delete

echo "Updated ${OUT_DIR}/replay-homepage-mobile.png and replay-vote-detail-mobile.png"
