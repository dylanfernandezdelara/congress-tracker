#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if command -v trufflehog >/dev/null 2>&1; then
  SCANNER_BIN="$(command -v trufflehog)"
elif [[ -x "${HOME}/Library/Python/3.9/bin/trufflehog" ]]; then
  SCANNER_BIN="${HOME}/Library/Python/3.9/bin/trufflehog"
else
  echo "trufflehog not found. Install with: python3 -m pip install --user trufflehog"
  exit 2
fi

OUTPUT_PATH="${1:-target/trufflehog-history-scan.json}"
mkdir -p "$(dirname "${OUTPUT_PATH}")"

set +e
"${SCANNER_BIN}" --json --regex --entropy=False --repo_path "${ROOT_DIR}" "file://${ROOT_DIR}" > "${OUTPUT_PATH}"
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
