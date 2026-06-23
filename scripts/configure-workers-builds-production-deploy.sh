#!/usr/bin/env bash
# Configure Cloudflare Workers Builds so pushes to main deploy production.
#
# Requires a *user-scoped* API token with "Workers Builds Configuration: Edit"
# (account-scoped deploy tokens return "Invalid token" on the Builds API).
# Create one at: https://dash.cloudflare.com/profile/api-tokens
#
# Usage:
#   CLOUDFLARE_BUILDS_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... \
#     ./scripts/configure-workers-builds-production-deploy.sh
#
# Optional:
#   WORKER_NAME=congress-tracker-api  (default)

set -euo pipefail

WORKER_NAME="${WORKER_NAME:-congress-tracker-api}"
ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-}"
API_TOKEN="${CLOUDFLARE_BUILDS_API_TOKEN:-${CLOUDFLARE_API_TOKEN:-}}"

BUILD_COMMAND='npm ci && npm --prefix workers/senate_data_worker ci && npm --prefix web ci && npm run build:web'
PRODUCTION_DEPLOY_COMMAND='npm --prefix workers/senate_data_worker run deploy'
PREVIEW_DEPLOY_COMMAND='npm --prefix workers/senate_data_worker run preview:upload'

if [[ -z "${ACCOUNT_ID}" || -z "${API_TOKEN}" ]]; then
  echo "error: set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_BUILDS_API_TOKEN (or CLOUDFLARE_API_TOKEN with Builds Configuration permission)." >&2
  exit 1
fi

if ! command -v curl >/dev/null || ! command -v jq >/dev/null; then
  echo "error: curl and jq are required." >&2
  exit 1
fi

api() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  if [[ -n "${data}" ]]; then
    curl -fsS "https://api.cloudflare.com/client/v4${path}" \
      --header "Authorization: Bearer ${API_TOKEN}" \
      --header "Content-Type: application/json" \
      --request "${method}" \
      --data "${data}"
  else
    curl -fsS "https://api.cloudflare.com/client/v4${path}" \
      --header "Authorization: Bearer ${API_TOKEN}" \
      --request "${method}"
  fi
}

worker_tag="$(
  api GET "/accounts/${ACCOUNT_ID}/workers/scripts" \
    | jq -r --arg name "${WORKER_NAME}" '.result[] | select(.id == $name) | .tag' \
    | head -n 1
)"

if [[ -z "${worker_tag}" || "${worker_tag}" == "null" ]]; then
  echo "error: worker ${WORKER_NAME} not found in account ${ACCOUNT_ID}." >&2
  exit 1
fi

triggers_json="$(api GET "/accounts/${ACCOUNT_ID}/builds/workers/${worker_tag}/triggers")"
if ! jq -e '.success == true' <<<"${triggers_json}" >/dev/null; then
  echo "error: Builds API rejected the token (need user-scoped token with Workers Builds Configuration: Edit):" >&2
  jq '.errors' <<<"${triggers_json}" >&2
  exit 1
fi

trigger_count="$(jq '.result | length' <<<"${triggers_json}")"
if [[ "${trigger_count}" -eq 0 ]]; then
  echo "error: no Workers Builds triggers found for ${WORKER_NAME}. Connect the repo in the Cloudflare dashboard first." >&2
  exit 1
fi

is_production_trigger() {
  jq -e '
    (.branch_includes // []) | index("main") != null
    and ((.branch_includes // []) | index("*") == null)
  ' <<<"$1" >/dev/null
}

is_preview_trigger() {
  jq -e '
    ((.branch_includes // []) | index("*") != null)
    or ((.branch_excludes // []) | index("main") != null)
  ' <<<"$1" >/dev/null
}

update_trigger() {
  local trigger_uuid="$1"
  local trigger_name="$2"
  local deploy_command="$3"

  payload="$(jq -n \
    --arg build_command "${BUILD_COMMAND}" \
    --arg deploy_command "${deploy_command}" \
    '{build_command: $build_command, deploy_command: $deploy_command}')"

  response="$(api PATCH "/accounts/${ACCOUNT_ID}/builds/triggers/${trigger_uuid}" "${payload}")"
  if ! jq -e '.success == true' <<<"${response}" >/dev/null; then
    echo "error: failed to update trigger ${trigger_name} (${trigger_uuid}):" >&2
    jq '.errors' <<<"${response}" >&2
    exit 1
  fi

  echo "updated ${trigger_name} (${trigger_uuid})"
  echo "  build_command:  ${BUILD_COMMAND}"
  echo "  deploy_command: ${deploy_command}"
}

updated_production=0
updated_preview=0

while IFS= read -r trigger; do
  trigger_uuid="$(jq -r '.trigger_uuid' <<<"${trigger}")"
  trigger_name="$(jq -r '.trigger_name' <<<"${trigger}")"

  if is_production_trigger "${trigger}"; then
    update_trigger "${trigger_uuid}" "${trigger_name}" "${PRODUCTION_DEPLOY_COMMAND}"
    updated_production=1
  elif is_preview_trigger "${trigger}"; then
    update_trigger "${trigger_uuid}" "${trigger_name}" "${PREVIEW_DEPLOY_COMMAND}"
    updated_preview=1
  else
    echo "skip ${trigger_name} (${trigger_uuid}) — unrecognized branch pattern" >&2
  fi
done < <(jq -c '.result[]' <<<"${triggers_json}")

if [[ "${updated_production}" -eq 0 ]]; then
  echo "error: no production trigger (branch_includes: [\"main\"]) found." >&2
  exit 1
fi

if [[ "${updated_preview}" -eq 0 ]]; then
  echo "warning: no preview trigger updated (branch_includes: [\"*\"] or branch_excludes: [\"main\"])." >&2
  echo "warning: enable non-production branch builds in the Cloudflare dashboard if PR previews are needed." >&2
fi

echo
echo "Workers Builds is configured:"
echo "  main (production) -> ${PRODUCTION_DEPLOY_COMMAND}"
if [[ "${updated_preview}" -eq 1 ]]; then
  echo "  other branches    -> ${PREVIEW_DEPLOY_COMMAND}"
fi
echo
echo "Production URL: https://${WORKER_NAME}.<subdomain>.workers.dev"
echo "Next push to main will deploy there automatically."
