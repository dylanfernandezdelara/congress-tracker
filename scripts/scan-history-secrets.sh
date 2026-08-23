#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if [[ -n "${TRUFFLEHOG_BIN:-}" && -x "${TRUFFLEHOG_BIN}" ]]; then
  SCANNER_BIN="${TRUFFLEHOG_BIN}"
elif command -v trufflehog >/dev/null 2>&1; then
  SCANNER_BIN="$(command -v trufflehog)"
elif [[ -x "${HOME}/.local/bin/trufflehog" ]]; then
  SCANNER_BIN="${HOME}/.local/bin/trufflehog"
elif [[ -x "${HOME}/Library/Python/3.9/bin/trufflehog" ]]; then
  SCANNER_BIN="${HOME}/Library/Python/3.9/bin/trufflehog"
else
  echo "trufflehog not found. Install with: python3 -m pip install --user trufflehog"
  exit 2
fi

OUTPUT_PATH="${1:-target/trufflehog-history-scan.json}"
ALLOW_PATH="${ROOT_DIR}/scripts/trufflehog-allow.json"
mkdir -p "$(dirname "${OUTPUT_PATH}")"

# Default trufflehog 2.x fetches every origin ref and scans them all. A stale
# feature branch with test fixtures must not fail main CI.
SCAN_BRANCH="${TRUFFLEHOG_BRANCH:-}"
if [[ -z "${SCAN_BRANCH}" ]]; then
  SCAN_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  if [[ -z "${SCAN_BRANCH}" || "${SCAN_BRANCH}" == "HEAD" ]]; then
    SCAN_BRANCH="main"
  fi
fi

set +e
"${SCANNER_BIN}" --json --regex --entropy=False \
  --allow "${ALLOW_PATH}" \
  --branch "${SCAN_BRANCH}" \
  --repo_path "${ROOT_DIR}" \
  "file://${ROOT_DIR}" > "${OUTPUT_PATH}"
status=$?
set -e

if [[ -s "${OUTPUT_PATH}" ]]; then
  echo "Potential secrets found in git history. Review: ${OUTPUT_PATH}"
  exit 1
fi

if [[ ${status} -ne 0 ]]; then
  echo "History scanner failed with exit code ${status}. Check tool setup."
  exit "${status}"
fi

echo "History secret scan passed."
