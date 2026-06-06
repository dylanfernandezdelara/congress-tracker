#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

echo "== Public readiness validation loop =="

echo "-- Scanning tracked files for secrets --"
"${ROOT_DIR}/scripts/scan-tracked-secrets.sh"

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

tracked_docs_screenshots="$(git ls-files 'docs/screenshots/*.png' || true)"
if [[ -n "${tracked_docs_screenshots}" ]]; then
  echo "Tracked docs/screenshots PNGs must not be committed (use Cursor Cloud capture instead):"
  printf '%s\n' "${tracked_docs_screenshots}"
  exit 1
fi

echo "All validation gates passed."
