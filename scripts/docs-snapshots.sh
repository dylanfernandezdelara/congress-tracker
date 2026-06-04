#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=/dev/null
source "${ROOT_DIR}/scripts/harness-env.sh"

"${ROOT_DIR}/scripts/screenshot-replay.sh"

for required in "${HARNESS_REPLAY_SCREENSHOT_HOMEPAGE_PATH}" "${HARNESS_REPLAY_SCREENSHOT_VOTE_DETAIL_PATH}"; do
  if [[ ! -s "${required}" ]]; then
    echo "Replay screenshot flow did not produce: ${required}" >&2
    exit 1
  fi
done

mkdir -p "${HARNESS_DOCS_SCREENSHOT_DIR}"
cp "${HARNESS_REPLAY_SCREENSHOT_HOMEPAGE_PATH}" "${HARNESS_DOCS_REPLAY_SCREENSHOT_HOMEPAGE_PATH}"
cp "${HARNESS_REPLAY_SCREENSHOT_VOTE_DETAIL_PATH}" "${HARNESS_DOCS_REPLAY_SCREENSHOT_VOTE_DETAIL_PATH}"

echo "Docs screenshots updated:"
echo "  ${HARNESS_DOCS_REPLAY_SCREENSHOT_HOMEPAGE_PATH}"
echo "  ${HARNESS_DOCS_REPLAY_SCREENSHOT_VOTE_DETAIL_PATH}"
