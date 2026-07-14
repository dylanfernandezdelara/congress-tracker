#!/usr/bin/env bash
# Seed the housing/SAVE executive alert (Truth Social post → H.R. 6644 + H.R. 22).
#
# Usage:
#   npm run seed:executive              # local D1 only
#   CONFIRM_PRODUCTION_SEED=1 npm run seed:executive -- --remote
#     # writes sample data to the PRODUCTION D1 database (congress-tracker)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER_DIR="${ROOT_DIR}/workers/senate_data_worker"
DB_NAME="congress-tracker"

TARGET="local"
if [[ "${1:-}" == "--remote" ]]; then
  TARGET="remote"
fi

days_ago() {
  local n="$1"
  if date -u -v-1d >/dev/null 2>&1; then
    date -u -v-"${n}"d +%Y-%m-%d
  else
    date -u -d "${n} days ago" +%Y-%m-%d
  fi
}

POSTED_DATE="$(days_ago 1)"
POSTED_AT="${POSTED_DATE}T14:26:00.000Z"
NOW_ISO="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"

read -r -d '' SEED_SQL <<SQL || true
CREATE TABLE IF NOT EXISTS executive_posts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  author TEXT NOT NULL,
  text TEXT NOT NULL,
  posted_at TEXT NOT NULL,
  source_url TEXT NOT NULL,
  archive_url TEXT,
  summary TEXT,
  raw_json TEXT,
  ingested_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS executive_post_bills (
  post_id TEXT NOT NULL,
  bill_congress INTEGER NOT NULL,
  bill_type TEXT NOT NULL,
  bill_number INTEGER NOT NULL,
  link_method TEXT NOT NULL,
  role TEXT NOT NULL,
  confidence REAL NOT NULL,
  rationale TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, bill_congress, bill_type, bill_number),
  FOREIGN KEY (post_id) REFERENCES executive_posts(id)
);
CREATE INDEX IF NOT EXISTS idx_executive_posts_posted ON executive_posts (posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_executive_post_bills_bill ON executive_post_bills (bill_congress, bill_type, bill_number);

INSERT OR REPLACE INTO executive_posts (
  id, platform, author, text, posted_at, source_url, archive_url,
  summary, raw_json, ingested_at
) VALUES (
  '116805545512296111',
  'truth_social',
  'realDonaldTrump',
  'Today''s Housing News Conference and Signing is hereby cancelled until such time as we pass the desperately needed SAVE AMERICA ACT, which I consider to be a National Emergency. Thank you for your attention to this matter! President DJT',
  '${POSTED_AT}',
  'https://truthsocial.com/@realDonaldTrump/116805545512296111',
  'https://www.trumpstruth.org/statuses/39514',
  'Cancelled housing signing until SAVE Act passes',
  '{"id":"116805545512296111","seed":true}',
  '${NOW_ISO}'
);

DELETE FROM executive_post_bills WHERE post_id = '116805545512296111';

INSERT INTO executive_post_bills (
  post_id, bill_congress, bill_type, bill_number,
  link_method, role, confidence, rationale, is_primary
) VALUES
  ('116805545512296111', 119, 'HR', 6644, 'seed', 'primary', 0.96, 'Post cancels housing signing ceremony', 1),
  ('116805545512296111', 119, 'HR', 22, 'seed', 'conditional', 0.94, 'Signing delayed until SAVE America Act passes', 0);

INSERT OR REPLACE INTO bill_digests (
  congress, bill_type, number, title, policy_area, raw_summary_text, digest_json, created_at, updated_at
) VALUES (
  119, 'HR', 6644, '21st Century ROAD to Housing Act (local sample)', 'Housing',
  'Sample CRS-style summary seeded for local development.',
  '{"headline":"Overhauls federal housing programs (local sample)","what_it_does":"Reforms federal housing finance and expands access to affordable housing.","key_points":["Updates FHA and Ginnie Mae programs","Expands rural housing assistance"],"terms_explained":[{"term":"FHA","plain":"Federal Housing Administration — insures mortgages for qualified borrowers."}]}',
  '${NOW_ISO}', '${NOW_ISO}'
);
SQL

if [[ "${SEED_PRINT_SQL:-}" == "1" ]]; then
  printf '%s\n' "${SEED_SQL}"
  exit 0
fi

SEED_FILE="$(mktemp -t seed-executive-signal.XXXXXX.sql)"
trap 'rm -f "${SEED_FILE}"' EXIT
printf '%s\n' "${SEED_SQL}" >"${SEED_FILE}"

if [[ "${TARGET}" == "remote" ]]; then
  if [[ "${CONFIRM_PRODUCTION_SEED:-}" != "1" ]]; then
    echo "ERROR: Refusing to seed the PRODUCTION D1 database '${DB_NAME}'." >&2
    echo "Re-run with CONFIRM_PRODUCTION_SEED=1 if you really intend to write sample data to production." >&2
    exit 1
  fi
  echo "WARNING: Seeding PRODUCTION D1 database '${DB_NAME}' (--remote)." >&2
  echo "This writes sample executive-signal data into the live production database." >&2
  echo "Seeding executive alert into remote D1 (${DB_NAME})..."
  ( cd "${WORKER_DIR}" && npx wrangler d1 execute "${DB_NAME}" --remote --file "${SEED_FILE}" )
else
  echo "Seeding executive alert into local D1 (${DB_NAME})..."
  ( cd "${WORKER_DIR}" && npx wrangler d1 execute "${DB_NAME}" --local --file "${SEED_FILE}" )
fi

echo "Executive alert seeded (${TARGET}). Check GET /executive/alerts.json on the target Worker."
