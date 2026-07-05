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
  digest_failure_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (congress, bill_type, number)
);
CREATE TABLE IF NOT EXISTS members (
  bioguide_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  chamber TEXT NOT NULL,
  party TEXT,
  state TEXT,
  district INTEGER,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS member_votes (
  chamber TEXT NOT NULL,
  congress INTEGER NOT NULL,
  session INTEGER NOT NULL,
  roll_number INTEGER NOT NULL,
  bioguide_id TEXT NOT NULL,
  position TEXT NOT NULL,
  PRIMARY KEY (chamber, congress, session, roll_number, bioguide_id)
);
CREATE TABLE IF NOT EXISTS financial_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bioguide_id TEXT NOT NULL,
  ticker TEXT,
  asset_description TEXT,
  transaction_type TEXT NOT NULL,
  amount_min INTEGER,
  amount_max INTEGER,
  transaction_date TEXT NOT NULL,
  filed_date TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  bioguide_id TEXT NOT NULL,
  as_of_date TEXT NOT NULL,
  estimated_value_usd REAL,
  session_return_pct REAL NOT NULL,
  PRIMARY KEY (bioguide_id, as_of_date)
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

generate_roster_sql() {
  python3 <<PY
updated = "${D_RECENT}T00:00:00.000Z"
mid = "${D_MID}T00:00:00.000Z"

spotlight_members = [
    ("LOCAL:H001", "Rep. Sample Crossover (local)", "House", "D", "CA", 12, updated),
    ("LOCAL:H002", "Rep. Sample Loyal (local)", "House", "D", "NY", 10, updated),
    ("LOCAL:H003", "Rep. Portfolio Gainer (local)", "House", "D", "CA", "NULL", updated),
    ("LOCAL:H004", "Rep. Portfolio Loser (local)", "House", "R", "SC", "NULL", updated),
    ("LOCAL:S001", "Sen. Sample Crossover (local)", "Senate", "R", "TX", "NULL", mid),
    ("LOCAL:S002", "Sen. Sample Loyal (local)", "Senate", "R", "TX", "NULL", mid),
]

def party_sequence(counts):
    for party, count in counts:
        for _ in range(count):
            yield party

# Spotlight house: 3D + 1R already; fill to 435 with 119th-like split.
house_rest = list(party_sequence([("R", 219), ("D", 210), ("I", 2)]))
senate_rest = list(party_sequence([("R", 51), ("D", 45), ("I", 2)]))

member_rows = []
vote_rows = []

for bid, name, chamber, party, state, district, ts in spotlight_members:
    member_rows.append(
        f"  ('{bid}', '{name}', '{chamber}', '{party}', '{state}', {district}, '{ts}')"
    )

for idx, party in enumerate(house_rest, start=1):
    bid = f"LOCAL:HR{idx:04d}"
    member_rows.append(
        f"  ('{bid}', 'Rep. Sample {idx} (local)', 'House', '{party}', 'TX', {idx % 50 + 1}, '{updated}')"
    )
    vote_rows.append(f"  ('House', 119, 2, 9001, '{bid}', 'Yea')")

for idx, party in enumerate(senate_rest, start=1):
    bid = f"LOCAL:SR{idx:03d}"
    member_rows.append(
        f"  ('{bid}', 'Sen. Sample {idx} (local)', 'Senate', '{party}', 'TX', NULL, '{updated}')"
    )
    vote_rows.append(f"  ('Senate', 119, 2, 9002, '{bid}', 'Yea')")

for bid, _, chamber, _, _, _, _ in spotlight_members:
    if chamber == "House":
        roll = 9001 if bid in ("LOCAL:H001", "LOCAL:H002") else 9003
        position = "Nay" if bid == "LOCAL:H001" else "Yea"
        vote_rows.append(f"  ('House', 119, 2, {roll}, '{bid}', '{position}')")
    else:
        position = "Nay" if bid == "LOCAL:S001" else "Yea"
        vote_rows.append(f"  ('Senate', 119, 2, 9002, '{bid}', '{position}')")

print("INSERT OR REPLACE INTO members (bioguide_id, name, chamber, party, state, district, updated_at) VALUES")
print(",\n".join(member_rows) + ";")
print("")
print("INSERT OR REPLACE INTO member_votes (chamber, congress, session, roll_number, bioguide_id, position) VALUES")
print(",\n".join(vote_rows) + ";")
PY
}

read -r -d '' SEED_TAIL <<SQL || true

INSERT INTO financial_transactions (bioguide_id, ticker, asset_description, transaction_type, amount_min, amount_max, transaction_date, filed_date) VALUES
  ('LOCAL:H003', 'NVDA', 'NVDA common stock', 'purchase', 50000, 100000, '${D_RECENT}', '${D_RECENT}'),
  ('LOCAL:H004', 'BA', 'BA common stock', 'sale', 1000, 15000, '${D_RECENT}', '${D_RECENT}');

INSERT OR REPLACE INTO portfolio_snapshots (bioguide_id, as_of_date, estimated_value_usd, session_return_pct) VALUES
  ('LOCAL:H003', '${D_RECENT}', 250000, 18.6),
  ('LOCAL:H004', '${D_RECENT}', 80000, -4.1),
  ('LOCAL:S001', '${D_MID}', 120000, 6.2),
  ('LOCAL:S002', '${D_MID}', 95000, -2.5);
SQL

if [[ "${SEED_PRINT_SQL:-}" == "1" ]]; then
  printf '%s\n' "${SEED_SQL}"
  generate_roster_sql
  printf '%s\n' "${SEED_TAIL}"
  exit 0
fi

SEED_FILE="$(mktemp -t seed-local-feed.XXXXXX.sql)"
trap 'rm -f "${SEED_FILE}"' EXIT
{
  printf '%s\n' "${SEED_SQL}"
  generate_roster_sql
  printf '%s\n' "${SEED_TAIL}"
} >"${SEED_FILE}"

echo "Seeding local D1 (${DB_NAME}) with sample passage votes, digests, and sidebar stats..."
# Run from the worker dir so --local resolves the same .wrangler/state store
# that `npm run dev:worker` (wrangler dev) uses.
( cd "${WORKER_DIR}" && npx wrangler d1 execute "${DB_NAME}" --local --file "${SEED_FILE}" )

cat <<'DONE'

Local feed seeded. Next:
  npm run dev:worker   # http://127.0.0.1:8787
  npm run dev:web      # http://127.0.0.1:5173
  curl -fsS http://127.0.0.1:8787/feed/latest.json
  curl -fsS http://127.0.0.1:8787/stats/session.json

Seeded rows are clearly marked "(local sample)" and contain no live data.
DONE
