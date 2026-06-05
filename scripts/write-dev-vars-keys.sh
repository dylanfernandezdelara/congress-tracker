#!/usr/bin/env bash
# Write named environment variables into a dotenv file with safe quoting.
# Usage: write-dev-vars-keys.sh <dev.vars.path> KEY [KEY...]
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/lib/dev-vars.sh
source "${ROOT_DIR}/scripts/lib/dev-vars.sh"

if [[ $# -lt 2 ]]; then
  echo "usage: $0 <dev.vars.path> KEY [KEY...]" >&2
  exit 1
fi

DEV_VARS="$1"
shift

touch "${DEV_VARS}"
chmod 600 "${DEV_VARS}"

for key in "$@"; do
  value="${!key:-}"
  if is_bridged_var_set "${value}"; then
    upsert_dev_var_in_file "${DEV_VARS}" "${key}" "${value}"
  fi
done
