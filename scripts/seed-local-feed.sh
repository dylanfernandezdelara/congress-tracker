#!/usr/bin/env bash
# Seed the LOCAL D1 database with sample passage votes + digests so the feed
# renders without any API keys or network access.
#
# This only ever touches the local Miniflare D1 store under
# workers/senate_data_worker/.wrangler/state (via `wrangler d1 execute --local`).
# It never reaches production/preview D1.
#
# Usage:
#   npm run seed                 # write sample data into local D1
#   SEED_PRINT_SQL=1 npm run seed  # print the SQL it would run, then exit
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER_DIR="${ROOT_DIR}/workers/senate_data_worker"

# Database name as defined in workers/senate_data_worker/wrangler.toml.
DB_NAME="congress-tracker"

# Recent dates so seeded votes fall inside the feed lookback window
# (VOTE_LOOKBACK_DAYS). Portable across BSD (macOS) and GNU date.
days_ago() {
  local n="$1"
  if date -u -v-1d >/dev/null 2>&1; then
    date -u -v-"${n}"d +%Y-%m-%d
  else
    date -u -d "${n} days ago" +%Y-%m-%d
  fi
}

D_RECENT="$(days_ago 1)"
D_MID="$(days_ago 4)"
D_OLDER="$(days_ago 9)"

# Schema mirrors workers/senate_data_worker/src/d1/schema.ts so seeding works
# against a brand-new local store before the worker has applied its schema.
read -r -d '' SEED_SQL <<SQL || true
CREATE TABLE IF NOT EXISTS votes (
  chamber TEXT NOT NULL,
  congress INTEGER NOT NULL,
  session INTEGER NOT NULL,
  roll_number INTEGER NOT NULL,
  bill_congress INTEGER NOT NULL,
  bill_type TEXT NOT NULL,
  bill_number INTEGER NOT NULL,
  question TEXT NOT NULL,
  result TEXT NOT NULL,
  yeas INTEGER NOT NULL,
  nays INTEGER NOT NULL,
  vote_date TEXT NOT NULL,
  is_passage INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (chamber, congress, session, roll_number)
);
CREATE TABLE IF NOT EXISTS bill_digests (
  congress INTEGER NOT NULL,
  bill_type TEXT NOT NULL,
  number INTEGER NOT NULL,
  title TEXT,
  policy_area TEXT,
  raw_summary_text TEXT,
  digest_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (congress, bill_type, number)
);

INSERT OR REPLACE INTO votes
  (chamber, congress, session, roll_number, bill_congress, bill_type, bill_number, question, result, yeas, nays, vote_date, is_passage)
VALUES
  ('House', 119, 2, 9001, 119, 'hr', 1, 'On Passage', 'Passed', 220, 213, '${D_RECENT}', 1),
  ('Senate', 119, 2, 9002, 119, 's', 47, 'On Passage of the Bill', 'Passed', 68, 32, '${D_MID}', 1),
  ('House', 119, 2, 9003, 119, 'hr', 22, 'On Passage', 'Passed', 314, 117, '${D_OLDER}', 1);

INSERT OR REPLACE INTO bill_digests
  (congress, bill_type, number, title, policy_area, raw_summary_text, digest_json, created_at, updated_at)
VALUES
  (119, 'hr', 1, 'Lower Energy Costs Act (local sample)', 'Energy',
   'Sample CRS-style summary seeded for local development. No live data was fetched.',
   '{"headline":"House passes a broad energy permitting and production package (local sample)","what_it_does":"Speeds up federal permitting for energy and mineral projects and rolls back several restrictions on domestic production.","key_points":["Sets shorter deadlines for environmental permit reviews","Expands domestic oil, gas, and mineral leasing","Streamlines approvals for pipelines and transmission lines"],"terms_explained":[{"term":"Permitting","plain":"The government approval process a project must clear before construction can begin."},{"term":"Leasing","plain":"Renting federal land or waters to companies so they can extract resources."}]}',
   '${D_RECENT}T00:00:00.000Z', '${D_RECENT}T00:00:00.000Z'),
  (119, 's', 47, 'Public Lands and Waters Protection Act (local sample)', 'Public Lands and Natural Resources',
   'Sample CRS-style summary seeded for local development. No live data was fetched.',
   '{"headline":"Senate passes a public lands conservation and access bill (local sample)","what_it_does":"Designates new protected areas and reauthorizes funding for trails, parks, and outdoor recreation access.","key_points":["Creates new wilderness and conservation designations","Reauthorizes a federal outdoor recreation fund","Expands public access points for hunting and fishing"],"terms_explained":[{"term":"Wilderness designation","plain":"A legal label that limits development on a piece of federal land to protect it."},{"term":"Reauthorize","plain":"Renew an existing program or its funding past its expiration date."}]}',
   '${D_MID}T00:00:00.000Z', '${D_MID}T00:00:00.000Z'),
  (119, 'hr', 22, 'Government Accountability and Savings Act (local sample)', 'Government Operations and Politics',
   'Sample CRS-style summary seeded for local development. No live data was fetched.',
   '{"headline":"House passes a federal spending oversight bill (local sample)","what_it_does":"Adds reporting requirements for large federal contracts and creates a public dashboard for tracking agency spending.","key_points":["Requires agencies to publish contract performance data","Stands up a public spending dashboard","Adds penalties for repeated reporting failures"],"terms_explained":[{"term":"Federal contract","plain":"An agreement where the government pays a company to provide goods or services."},{"term":"Oversight","plain":"Monitoring done to make sure money and programs are used as intended."}]}',
   '${D_OLDER}T00:00:00.000Z', '${D_OLDER}T00:00:00.000Z');
SQL

if [[ "${SEED_PRINT_SQL:-}" == "1" ]]; then
  printf '%s\n' "${SEED_SQL}"
  exit 0
fi

SEED_FILE="$(mktemp -t seed-local-feed.XXXXXX.sql)"
trap 'rm -f "${SEED_FILE}"' EXIT
printf '%s\n' "${SEED_SQL}" >"${SEED_FILE}"

echo "Seeding local D1 (${DB_NAME}) with sample passage votes + digests..."
# Run from the worker dir so --local resolves the same .wrangler/state store
# that `npm run dev:worker` (wrangler dev) uses.
( cd "${WORKER_DIR}" && npx wrangler d1 execute "${DB_NAME}" --local --file "${SEED_FILE}" )

cat <<'DONE'

Local feed seeded. Next:
  npm run dev:worker   # http://127.0.0.1:8787
  npm run dev:web      # http://127.0.0.1:5173
  curl -fsS http://127.0.0.1:8787/feed/latest.json

Seeded rows are clearly marked "(local sample)" and contain no live data.
DONE
