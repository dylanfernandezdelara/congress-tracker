#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

echo "== Public readiness validation loop =="

echo "-- Scanning tracked files for secrets --"
"${ROOT_DIR}/scripts/scan-tracked-secrets.sh"

echo "-- Scanning git history for secrets --"
"${ROOT_DIR}/scripts/scan-history-secrets.sh"

echo "-- Sweeping for internal/staging URL references --"
"${ROOT_DIR}/scripts/scan-internal-references.sh"

echo "-- Checking for tracked generated screenshot artifacts --"
tracked_artifacts="$(git ls-files | rg '^senate-(current|page)-(top|full|bottom)\.png$' || true)"
if [[ -n "${tracked_artifacts}" ]]; then
  existing_tracked_artifacts="$(
    while IFS= read -r artifact; do
      if [[ -f "${artifact}" ]]; then
        printf '%s\n' "${artifact}"
      fi
    done <<< "${tracked_artifacts}"
  )"
  if [[ -n "${existing_tracked_artifacts}" ]]; then
    echo "Tracked generated screenshot artifacts detected in repo root:"
    printf '%s\n' "${existing_tracked_artifacts}"
    exit 1
  fi
fi

echo "-- Worker typecheck and tests --"
(
  cd "${ROOT_DIR}/workers/senate_data_worker"
  npm run check
  npm test
)

echo "-- Web typecheck and tests --"
(
  cd "${ROOT_DIR}/web"
  npm exec -- tsc --noEmit
  npm test
)

echo "All validation gates passed."
