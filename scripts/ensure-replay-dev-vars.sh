#!/usr/bin/env bash
# Ensure local worker .dev.vars uses replay fixtures for UI/dev unless live is explicit.
set -euo pipefail

WORKER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../workers/senate_data_worker" && pwd)"
DEV_VARS="${WORKER_DIR}/.dev.vars"
DEV_VARS_EXAMPLE="${WORKER_DIR}/.dev.vars.example"

REPLAY_KEYS=(
  "DATA_SOURCE=replay"
  "REPLAY_FIXTURE_SET=canonical"
  "CLOCK=2026-01-20T15:00:00Z"
)

if [[ ! -f "${DEV_VARS}" ]]; then
  echo "Creating ${DEV_VARS} from example (replay defaults)..."
  cp "${DEV_VARS_EXAMPLE}" "${DEV_VARS}"
  exit 0
fi

if grep -qE '^[[:space:]]*DATA_SOURCE[[:space:]]*=[[:space:]]*live[[:space:]]*$' "${DEV_VARS}"; then
  echo "Leaving ${DEV_VARS} unchanged (DATA_SOURCE=live)."
  exit 0
fi

upsert_var() {
  local key="$1"
  local value="$2"
  local file="$3"
  if grep -qE "^[[:space:]]*${key}[[:space:]]*=" "${file}"; then
    sed -i -E "s|^[[:space:]]*${key}[[:space:]]*=.*|${key}=${value}|" "${file}"
  else
    printf '\n%s=%s\n' "${key}" "${value}" >> "${file}"
  fi
}

echo "Ensuring replay fixture defaults in ${DEV_VARS}..."
for entry in "${REPLAY_KEYS[@]}"; do
  key="${entry%%=*}"
  value="${entry#*=}"
  upsert_var "${key}" "${value}" "${DEV_VARS}"
done
