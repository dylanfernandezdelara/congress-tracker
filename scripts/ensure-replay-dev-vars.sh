#!/usr/bin/env bash
# Ensure local worker .dev.vars uses replay fixtures for UI/dev unless live is explicit.
set -euo pipefail

WORKER_DIR="${WORKER_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../workers/senate_data_worker" && pwd)}"
DEV_VARS="${WORKER_DIR}/.dev.vars"
DEV_VARS_EXAMPLE="${WORKER_DIR}/.dev.vars.example"

REPLAY_KEYS=(
  "DATA_SOURCE=replay"
  "REPLAY_FIXTURE_SET=canonical"
  "CLOCK=2026-01-20T15:00:00Z"
)

read_var_value() {
  local key="$1"
  local file="$2"
  local line
  line="$(grep -E "^[[:space:]]*${key}[[:space:]]*=" "${file}" | tail -1 || true)"
  if [[ -z "${line}" ]]; then
    return 1
  fi
  local value="${line#*=}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%%[[:space:]]*}"
  value="${value%%#*}"
  value="${value%"${value##*[![:space:]]}"}"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf '%s' "${value}"
}

is_live_mode() {
  local file="$1"
  if [[ ! -f "${file}" ]]; then
    return 1
  fi
  local value
  if ! value="$(read_var_value DATA_SOURCE "${file}")"; then
    return 1
  fi
  [[ "${value,,}" == "live" ]]
}

upsert_var_if_missing() {
  local key="$1"
  local value="$2"
  local file="$3"
  if grep -qE "^[[:space:]]*${key}[[:space:]]*=" "${file}"; then
    return 0
  fi
  printf '\n%s=%s\n' "${key}" "${value}" >> "${file}"
}

replace_var() {
  local key="$1"
  local value="$2"
  local file="$3"
  local tmp="${file}.tmp.$$"
  if ! grep -qE "^[[:space:]]*${key}[[:space:]]*=" "${file}"; then
    printf '\n%s=%s\n' "${key}" "${value}" >> "${file}"
    return 0
  fi
  awk -v key="${key}" -v value="${value}" '
    BEGIN { replaced = 0 }
    $0 ~ "^[[:space:]]*" key "[[:space:]]*=" {
      print key "=" value
      replaced = 1
      next
    }
    { print }
    END {
      if (!replaced) print key "=" value
    }
  ' "${file}" > "${tmp}"
  mv "${tmp}" "${file}"
}

if [[ ! -f "${DEV_VARS}" ]]; then
  echo "Creating ${DEV_VARS} from example (replay defaults)..."
  cp "${DEV_VARS_EXAMPLE}" "${DEV_VARS}"
fi

if is_live_mode "${DEV_VARS}"; then
  echo "Leaving ${DEV_VARS} unchanged (DATA_SOURCE=live)."
  exit 0
fi

# Ensure replay mode without clobbering intentional non-canonical fixture sets.
if ! value="$(read_var_value DATA_SOURCE "${DEV_VARS}" 2>/dev/null)" || [[ -z "${value}" ]]; then
  replace_var DATA_SOURCE replay "${DEV_VARS}"
elif [[ "${value,,}" != "replay" ]]; then
  echo "Leaving ${DEV_VARS} unchanged (DATA_SOURCE=${value})."
  exit 0
fi

echo "Ensuring replay fixture defaults in ${DEV_VARS} (missing keys only)..."
for entry in "${REPLAY_KEYS[@]}"; do
  key="${entry%%=*}"
  value="${entry#*=}"
  if [[ "${key}" == "DATA_SOURCE" ]]; then
    continue
  fi
  upsert_var_if_missing "${key}" "${value}" "${DEV_VARS}"
done
