#!/usr/bin/env bash
# Connect congress-tracker to Cloudflare Workers Builds for auto-deploy on main.
#
# Prerequisites:
#   1. Cloudflare GitHub App authorized once (dashboard → Worker → Settings → Builds → Connect).
#   2. User-scoped API token with Workers Builds Configuration (Edit) + Workers Scripts (Read).
#
# Usage:
#   export CLOUDFLARE_ACCOUNT_ID=...
#   export CLOUDFLARE_BUILDS_API_TOKEN=...   # user-scoped; NOT the account token
#   ./scripts/setup-workers-builds.sh [--preview] [--dry-run]
set -euo pipefail

# --- Project constants (congress-tracker) ---
WORKER_NAME="congress-tracker-api"
WORKER_TAG="0398358f0f8a4130b5e60eaff2846902"
GITHUB_ACCOUNT_ID="65196174"
GITHUB_ACCOUNT_NAME="dylanfernandezdelara"
GITHUB_REPO_ID="1127010749"
GITHUB_REPO_NAME="congress-tracker"
PRODUCTION_BRANCH="main"
ROOT_DIRECTORY="/"
BUILD_COMMAND="npm ci && npm --prefix workers/senate_data_worker ci && npm --prefix web ci && npm run build:web"
DEPLOY_COMMAND="npx wrangler deploy --config workers/senate_data_worker/wrangler.toml"
PREVIEW_DEPLOY_COMMAND="npx wrangler versions upload --config workers/senate_data_worker/wrangler.toml"

DRY_RUN=0
CREATE_PREVIEW=0

for arg in "$@"; do
  case "${arg}" in
    --dry-run) DRY_RUN=1 ;;
    --preview) CREATE_PREVIEW=1 ;;
    -h | --help)
      sed -n '1,20p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown argument: ${arg}" >&2
      exit 1
      ;;
  esac
done

ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-}"
API_TOKEN="${CLOUDFLARE_BUILDS_API_TOKEN:-${CLOUDFLARE_API_TOKEN:-}}"

if [[ -z "${ACCOUNT_ID}" || -z "${API_TOKEN}" ]]; then
  echo "Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_BUILDS_API_TOKEN (user-scoped)." >&2
  echo "Account-scoped tokens return 'Invalid token' from the Builds API." >&2
  exit 1
fi

API_BASE="https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}"

cf_api() {
  local method="$1"
  local path="$2"
  local data="${3:-}"

  if [[ "${DRY_RUN}" -eq 1 ]]; then
    echo "[dry-run] ${method} ${path}" >&2
    if [[ -n "${data}" ]]; then
      echo "${data}" | python3 -m json.tool >&2
    fi
    echo '{"success":true,"result":{}}'
    return 0
  fi

  local response
  if [[ -n "${data}" ]]; then
    response="$(curl -fsS \
      -X "${method}" \
      -H "Authorization: Bearer ${API_TOKEN}" \
      -H "Content-Type: application/json" \
      --data "${data}" \
      "${API_BASE}${path}")"
  else
    response="$(curl -fsS \
      -X "${method}" \
      -H "Authorization: Bearer ${API_TOKEN}" \
      "${API_BASE}${path}")"
  fi

  python3 -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get("success") else 1)' <<<"${response}" || {
    echo "${response}" | python3 -m json.tool >&2 || echo "${response}" >&2
    exit 1
  }
  echo "${response}"
}

json_result_field() {
  local json="$1"
  local field="$2"
  python3 -c 'import json,sys; d=json.load(sys.stdin); print((d.get("result") or {}).get(sys.argv[1], ""))' <<<"${json}" "${field}"
}

trigger_payload() {
  local name="$1"
  local deploy_cmd="$2"
  local branch_includes_json="$3"
  local branch_excludes_json="$4"
  python3 - <<PY
import json
print(json.dumps({
    "external_script_id": "${WORKER_TAG}",
    "repo_connection_uuid": "${repo_connection_uuid}",
    "build_token_uuid": "${build_token_uuid}",
    "trigger_name": "${name}",
    "build_command": "${BUILD_COMMAND}",
    "deploy_command": "${deploy_cmd}",
    "root_directory": "${ROOT_DIRECTORY}",
    "branch_includes": json.loads('''${branch_includes_json}'''),
    "branch_excludes": json.loads('''${branch_excludes_json}'''),
    "path_includes": ["*"],
    "path_excludes": [],
}))
PY
}

echo "==> Verifying Builds API access..."
if [[ "${DRY_RUN}" -eq 0 ]]; then
  tokens_response="$(cf_api GET "/builds/tokens")"
  build_token_uuid="$(python3 -c '
import json, sys
data = json.load(sys.stdin)
tokens = data.get("result") or []
if not tokens:
    raise SystemExit("No build tokens found. Create one in dashboard: Worker → Settings → Builds → API token.")
print(tokens[0]["build_token_uuid"])
' <<<"${tokens_response}")"
  echo "    Using build token: ${build_token_uuid}"
else
  build_token_uuid="<build-token-uuid>"
  cf_api GET "/builds/tokens"
fi

echo "==> Connecting GitHub repository ${GITHUB_ACCOUNT_NAME}/${GITHUB_REPO_NAME}..."
repo_payload="$(python3 - <<PY
import json
print(json.dumps({
    "provider_type": "github",
    "provider_account_id": "${GITHUB_ACCOUNT_ID}",
    "provider_account_name": "${GITHUB_ACCOUNT_NAME}",
    "repo_id": "${GITHUB_REPO_ID}",
    "repo_name": "${GITHUB_REPO_NAME}",
}))
PY
)"
repo_response="$(cf_api PUT "/builds/repos/connections" "${repo_payload}")"
if [[ "${DRY_RUN}" -eq 1 ]]; then
  repo_connection_uuid="<repo-connection-uuid>"
else
  repo_connection_uuid="$(json_result_field "${repo_response}" "repo_connection_uuid")"
  echo "    repo_connection_uuid=${repo_connection_uuid}"
fi

echo "==> Creating production trigger (branch: ${PRODUCTION_BRANCH})..."
prod_payload="$(trigger_payload "Deploy production" "${DEPLOY_COMMAND}" '["main"]' '[]')"
prod_response="$(cf_api POST "/builds/triggers" "${prod_payload}")"
if [[ "${DRY_RUN}" -eq 0 ]]; then
  prod_trigger_uuid="$(json_result_field "${prod_response}" "trigger_uuid")"
  echo "    production trigger_uuid=${prod_trigger_uuid}"
fi

if [[ "${CREATE_PREVIEW}" -eq 1 ]]; then
  echo "==> Creating preview trigger (all branches except ${PRODUCTION_BRANCH})..."
  preview_payload="$(trigger_payload "Deploy preview branches" "${PREVIEW_DEPLOY_COMMAND}" '["*"]' '["main"]')"
  preview_response="$(cf_api POST "/builds/triggers" "${preview_payload}")"
  if [[ "${DRY_RUN}" -eq 0 ]]; then
    preview_trigger_uuid="$(json_result_field "${preview_response}" "trigger_uuid")"
    echo "    preview trigger_uuid=${preview_trigger_uuid}"
  fi
fi

if [[ "${DRY_RUN}" -eq 0 && -n "${prod_trigger_uuid:-}" ]]; then
  echo "==> Triggering first production build on ${PRODUCTION_BRANCH}..."
  cf_api POST "/builds/triggers/${prod_trigger_uuid}/builds" "{\"branch\": \"${PRODUCTION_BRANCH}\"}" >/dev/null
  echo "    Build queued. Monitor: https://dash.cloudflare.com/?to=/:account/workers-and-pages/view/${WORKER_NAME}/production/deployments"
fi

echo "Done. Future pushes to ${PRODUCTION_BRANCH} will auto-deploy ${WORKER_NAME}."
echo "See docs/PRODUCTION_DEPLOYMENTS.md for dashboard setup and troubleshooting."
