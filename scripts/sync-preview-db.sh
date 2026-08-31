#!/usr/bin/env bash
# Copy production D1 into the isolated preview D1 so preview URLs show current
# feed data. Production is read-only (export). Preview is the only write target.
#
# Preview Workers bind congress-tracker-preview, do not run cron, and block
# pipeline writes — without this copy, preview URLs stay on a stale snapshot.
#
# Usage:
#   npm run sync:preview-db
#   SYNC_PREVIEW_DB_DRY_RUN=1 npm run sync:preview-db   # print plan, no D1 I/O
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER_DIR="${ROOT_DIR}/workers/senate_data_worker"
WORKER_TOML="${WORKER_DIR}/wrangler.toml"

PROD_DB_NAME="congress-tracker"
PREVIEW_DB_NAME="congress-tracker-preview"

toml_value() {
  local section="$1"
  local key="$2"
  awk -v section="${section}" -v key="${key}" '
    $0 == section { in_section = 1; next }
    in_section && /^\[/ { exit }
    in_section && index($0, key) == 1 {
      split($0, parts, "\"")
      print parts[2]
      exit
    }
  ' "${WORKER_TOML}"
}

PROD_DB_ID="$(toml_value '[[d1_databases]]' 'database_id')"
PREVIEW_DB_ID="$(toml_value '[[env.preview.d1_databases]]' 'database_id')"
TOML_PROD_NAME="$(toml_value '[[d1_databases]]' 'database_name')"
TOML_PREVIEW_NAME="$(toml_value '[[env.preview.d1_databases]]' 'database_name')"

if [[ "${TOML_PROD_NAME}" != "${PROD_DB_NAME}" ]]; then
  echo "ERROR: wrangler.toml production database_name is '${TOML_PROD_NAME}', expected '${PROD_DB_NAME}'." >&2
  exit 1
fi
if [[ "${TOML_PREVIEW_NAME}" != "${PREVIEW_DB_NAME}" ]]; then
  echo "ERROR: wrangler.toml preview database_name is '${TOML_PREVIEW_NAME}', expected '${PREVIEW_DB_NAME}'." >&2
  exit 1
fi
if [[ -z "${PROD_DB_ID}" || -z "${PREVIEW_DB_ID}" ]]; then
  echo "ERROR: could not read D1 database ids from ${WORKER_TOML}." >&2
  exit 1
fi
if [[ "${PROD_DB_ID}" == "${PREVIEW_DB_ID}" ]]; then
  echo "ERROR: production and preview D1 ids must differ; refusing to continue." >&2
  exit 1
fi

wrangler_d1() {
  ( cd "${WORKER_DIR}" && npx wrangler d1 "$@" )
}

echo "sync-preview-db: clone production D1 → preview D1"
echo "  source (export only): ${PROD_DB_NAME} (${PROD_DB_ID})"
echo "  dest   (write only):  ${PREVIEW_DB_NAME} (${PREVIEW_DB_ID})"
echo "  production is never executed against for writes"

if [[ "${SYNC_PREVIEW_DB_DRY_RUN:-}" == "1" ]]; then
  echo "DRY RUN: would export ${PROD_DB_NAME} --remote, DROP user tables on ${PREVIEW_DB_NAME} (keeping _cf_KV / sqlite_*), then execute the dump with --env preview --remote --yes."
  exit 0
fi

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" || -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  echo "ERROR: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required." >&2
  exit 2
fi

DUMP_FILE="$(mktemp -t congress-tracker-prod.XXXXXX.sql)"
DROP_FILE="$(mktemp -t congress-tracker-preview-drop.XXXXXX.sql)"
trap 'rm -f "${DUMP_FILE}" "${DROP_FILE}"' EXIT

echo "Exporting production D1 (read-only)..."
wrangler_d1 export "${PROD_DB_NAME}" --remote --output "${DUMP_FILE}"
if [[ ! -s "${DUMP_FILE}" ]]; then
  echo "ERROR: production export was empty." >&2
  exit 1
fi
if ! grep -q 'INSERT INTO "votes"' "${DUMP_FILE}"; then
  echo "ERROR: production export is missing votes rows." >&2
  exit 1
fi

d1_json_field() {
  local field="$1"
  node -e '
const fs = require("fs");
const data = JSON.parse(fs.readFileSync(0, "utf8"));
const row = (Array.isArray(data) ? data[0].results : data.results)[0];
const value = row[process.argv[1]];
process.stdout.write(value == null ? "" : String(value));
' "${field}"
}

echo "Reading production vote recency from export..."
PROD_VOTES="$(grep -c 'INSERT INTO "votes"' "${DUMP_FILE}")"
PROD_LATEST="$(grep 'INSERT INTO "votes"' "${DUMP_FILE}" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | sort | tail -1)"
echo "  production votes=${PROD_VOTES} latest=${PROD_LATEST}"

echo "Dropping existing user tables on preview D1 (not _cf_KV / sqlite_*)..."
TABLES_JSON="$(wrangler_d1 execute "${PREVIEW_DB_NAME}" --remote --env preview --json --yes --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")"
printf '%s' "${TABLES_JSON}" | node -e '
const fs = require("fs");
const data = JSON.parse(fs.readFileSync(0, "utf8"));
const results = Array.isArray(data) ? data[0].results : data.results;
const lines = ["PRAGMA foreign_keys=OFF;"];
for (const row of results) {
  const name = row.name;
  if (typeof name !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error("refusing to drop unexpected table name: " + name);
  }
  if (name.startsWith("_cf") || name.startsWith("sqlite_")) continue;
  lines.push("DROP TABLE IF EXISTS \"" + name + "\";");
}
lines.push("PRAGMA foreign_keys=ON;");
process.stdout.write(lines.join("\n") + "\n");
' > "${DROP_FILE}"
if ! grep -q 'DROP TABLE IF EXISTS' "${DROP_FILE}"; then
  echo "WARNING: preview D1 had no user tables to drop." >&2
else
  wrangler_d1 execute "${PREVIEW_DB_NAME}" --remote --env preview --yes --file "${DROP_FILE}"
fi

echo "Importing production dump into preview D1..."
wrangler_d1 execute "${PREVIEW_DB_NAME}" --remote --env preview --yes --file "${DUMP_FILE}"

echo "Verifying preview matches production vote recency..."
PREVIEW_STATS_JSON="$(wrangler_d1 execute "${PREVIEW_DB_NAME}" --remote --env preview --json --yes --command "SELECT COUNT(*) AS votes, MAX(vote_date) AS latest FROM votes;")"
PREVIEW_VOTES="$(printf '%s' "${PREVIEW_STATS_JSON}" | d1_json_field votes)"
PREVIEW_LATEST="$(printf '%s' "${PREVIEW_STATS_JSON}" | d1_json_field latest)"

if [[ "${PREVIEW_VOTES}" != "${PROD_VOTES}" || "${PREVIEW_LATEST}" != "${PROD_LATEST}" ]]; then
  echo "ERROR: preview votes=${PREVIEW_VOTES} latest=${PREVIEW_LATEST} does not match production votes=${PROD_VOTES} latest=${PROD_LATEST}." >&2
  exit 1
fi

echo "Preview D1 now matches production (${PREVIEW_VOTES} votes, latest ${PREVIEW_LATEST})."
echo "Existing preview URLs share this database; wait ~60s for feed Cache-Control to expire."
