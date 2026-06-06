#!/usr/bin/env bash
# Idempotent bootstrap for Cursor Cloud agents (also safe to run locally).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER_DIR="${ROOT_DIR}/workers/senate_data_worker"
WEB_DIR="${ROOT_DIR}/web"
DEV_VARS="${WORKER_DIR}/.dev.vars"
DEV_VARS_EXAMPLE="${WORKER_DIR}/.dev.vars.example"
CURSOR_SECRET_KEYS=(CONGRESS_API_KEY GOVINFO_API_KEY)

dotenv_quote() {
  local value="$1"
  value="${value//$'\r'/}"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  printf '"%s"' "${value}"
}

upsert_dev_var_from_env() {
  local key="$1" value tmp
  value="${!key-}"
  if [[ -z "${value}" || -z "${value//[[:space:]]/}" ]]; then
    return 1
  fi

  tmp="$(mktemp)"
  sed "/^[[:space:]]*${key}=/d" "${DEV_VARS}" >"${tmp}"
  printf '%s=%s\n' "${key}" "$(dotenv_quote "${value}")" >>"${tmp}"
  mv "${tmp}" "${DEV_VARS}"
  return 0
}

echo "Installing worker dependencies..."
npm --prefix "${WORKER_DIR}" ci

echo "Installing web dependencies..."
npm --prefix "${WEB_DIR}" ci

echo "Installing Playwright Chromium (for npm test and optional npm run snapshot)..."
npm --prefix "${WEB_DIR}" exec -- playwright install --with-deps chromium

if [[ ! -f "${DEV_VARS}" ]]; then
  echo "Creating ${DEV_VARS} from example..."
  cp "${DEV_VARS_EXAMPLE}" "${DEV_VARS}"
fi

chmod 600 "${DEV_VARS}" 2>/dev/null || true

configured_count=0
for key in "${CURSOR_SECRET_KEYS[@]}"; do
  if upsert_dev_var_from_env "${key}"; then
    configured_count=$((configured_count + 1))
  fi
done

if [[ "${configured_count}" -gt 0 ]]; then
  chmod 600 "${DEV_VARS}" 2>/dev/null || true
  echo "Configured ${configured_count} environment secret(s) for Wrangler local dev."
fi

echo "Cursor Cloud setup complete."
