#!/usr/bin/env bash
# Seed restores sample-only local D1: it never copies production or preview D1.
# Live local ingest (votes, digests, sponsors, lifecycle, nominations,
# confirmation votes) is wiped so the feed is not mixed with production-shaped
# rows. Real member-roster rows are also cleared so LOCAL:* spotlights stay
# visible after members-roster / member-votes.
#
# Default persist is workers/senate_data_worker/.wrangler/state (`npm run seed`).
# SEED_PERSIST_TO=<abs-dir> writes an isolated store instead (verification helper).
# Always `--local`. Never `--remote`.
#
# Usage:
#   npm run seed                      # write sample data into local D1
#   SEED_PERSIST_TO=/abs/dir npm run seed
#   SEED_PRINT_SQL=1 npm run seed     # print the SQL it would run, then exit
#   SEED_PRINT_CMD=1 npm run seed     # print the wrangler command, then exit
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
# Referrals older than PROCESS_STUCK_DAYS (90) so the pulse "Waiting in
# committee" widget has standing-committee rows to show.
D_STUCK="$(days_ago 100)"

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
CREATE TABLE IF NOT EXISTS bill_sponsors (
  congress INTEGER NOT NULL,
  bill_type TEXT NOT NULL,
  bill_number INTEGER NOT NULL,
  bioguide_id TEXT NOT NULL,
  state TEXT NOT NULL,
  full_name TEXT,
  party TEXT,
  is_primary INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (congress, bill_type, bill_number, bioguide_id)
);
CREATE INDEX IF NOT EXISTS idx_bill_sponsors_state ON bill_sponsors (state, congress, bill_type, bill_number);
CREATE INDEX IF NOT EXISTS idx_bill_sponsors_bill ON bill_sponsors (congress, bill_type, bill_number);
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
CREATE TABLE IF NOT EXISTS member_session_stats (
  bioguide_id TEXT NOT NULL,
  congress INTEGER NOT NULL,
  session INTEGER NOT NULL,
  votes_cast INTEGER NOT NULL,
  yea_count INTEGER NOT NULL,
  nay_count INTEGER NOT NULL,
  cross_vote_count INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (bioguide_id, congress, session)
);
CREATE TABLE IF NOT EXISTS member_cross_votes (
  chamber TEXT NOT NULL,
  congress INTEGER NOT NULL,
  session INTEGER NOT NULL,
  roll_number INTEGER NOT NULL,
  bioguide_id TEXT NOT NULL,
  bill_type TEXT NOT NULL,
  bill_number INTEGER NOT NULL,
  bill_congress INTEGER NOT NULL,
  vote_date TEXT NOT NULL,
  position TEXT NOT NULL,
  party_line TEXT NOT NULL,
  margin INTEGER NOT NULL,
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
CREATE TABLE IF NOT EXISTS bill_lifecycle (
  congress INTEGER NOT NULL,
  bill_type TEXT NOT NULL,
  bill_number INTEGER NOT NULL,
  introduced_date TEXT,
  presented_date TEXT,
  signed_date TEXT,
  vetoed_date TEXT,
  became_law_date TEXT,
  law_kind TEXT,
  public_law TEXT,
  latest_action_date TEXT,
  latest_action_text TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (congress, bill_type, bill_number)
);
CREATE TABLE IF NOT EXISTS bill_committee_events (
  congress INTEGER NOT NULL,
  bill_type TEXT NOT NULL,
  bill_number INTEGER NOT NULL,
  system_code TEXT NOT NULL,
  activity_key TEXT NOT NULL,
  activity_at TEXT NOT NULL,
  chamber TEXT NOT NULL,
  committee_name TEXT NOT NULL,
  parent_system_code TEXT,
  activity_raw TEXT NOT NULL,
  tally_text TEXT,
  PRIMARY KEY (congress, bill_type, bill_number, system_code, activity_key, activity_at)
);
CREATE TABLE IF NOT EXISTS bill_floor_events (
  congress INTEGER NOT NULL,
  bill_type TEXT NOT NULL,
  bill_number INTEGER NOT NULL,
  action_key TEXT NOT NULL,
  action_at TEXT NOT NULL,
  chamber TEXT NOT NULL,
  label TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  tally_text TEXT,
  PRIMARY KEY (congress, bill_type, bill_number, action_key, action_at, chamber)
);
CREATE TABLE IF NOT EXISTS committee_roster (
  congress INTEGER NOT NULL,
  system_code TEXT NOT NULL,
  chamber TEXT NOT NULL,
  name TEXT NOT NULL,
  committee_type TEXT NOT NULL,
  parent_system_code TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (congress, system_code)
);
CREATE TABLE IF NOT EXISTS process_refresh_queue (
  congress INTEGER NOT NULL,
  bill_type TEXT NOT NULL,
  bill_number INTEGER NOT NULL,
  queued_at TEXT NOT NULL,
  last_hydrated_at TEXT,
  PRIMARY KEY (congress, bill_type, bill_number)
);
CREATE TABLE IF NOT EXISTS nominations (
  congress INTEGER NOT NULL,
  nomination_number INTEGER NOT NULL,
  part_number INTEGER NOT NULL DEFAULT 0,
  citation TEXT NOT NULL,
  description TEXT,
  organization TEXT,
  position_title TEXT,
  nominees_json TEXT,
  received_date TEXT,
  raw_background_text TEXT,
  background_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (congress, nomination_number, part_number)
);
CREATE TABLE IF NOT EXISTS confirmation_votes (
  chamber TEXT NOT NULL,
  congress INTEGER NOT NULL,
  session INTEGER NOT NULL,
  roll_number INTEGER NOT NULL,
  nomination_congress INTEGER NOT NULL,
  nomination_number INTEGER NOT NULL,
  part_number INTEGER NOT NULL DEFAULT 0,
  question TEXT NOT NULL,
  result TEXT NOT NULL,
  yeas INTEGER NOT NULL,
  nays INTEGER NOT NULL,
  vote_date TEXT NOT NULL,
  PRIMARY KEY (chamber, congress, session, roll_number)
);
CREATE TABLE IF NOT EXISTS bill_text_changes (
  congress INTEGER NOT NULL,
  bill_type TEXT NOT NULL,
  bill_number INTEGER NOT NULL,
  summary_version TEXT,
  summary_version_date TEXT,
  latest_version TEXT,
  latest_version_date TEXT,
  added_json TEXT,
  more_added_count INTEGER NOT NULL DEFAULT 0,
  checked_at TEXT NOT NULL,
  PRIMARY KEY (congress, bill_type, bill_number)
);

-- Offline sample mode: wipe live-ingested feed rows so seed replaces rather
-- than merging production-shaped local ingest.
DELETE FROM votes;
DELETE FROM bill_digests;
DELETE FROM bill_sponsors;
DELETE FROM bill_lifecycle;
DELETE FROM nominations;
DELETE FROM confirmation_votes;
DELETE FROM bill_text_changes;

-- Offline sample mode: drop real-roster rows so hasRealMemberRoster stays false
-- and LOCAL:* defectors/portfolios remain visible in /stats/defectors.json and
-- /stats/portfolios.json (left-rail House/Senate spotlights).
DELETE FROM member_votes WHERE bioguide_id NOT LIKE 'LOCAL:%';
DELETE FROM member_session_stats WHERE bioguide_id NOT LIKE 'LOCAL:%';
DELETE FROM member_cross_votes WHERE bioguide_id NOT LIKE 'LOCAL:%';
DELETE FROM financial_transactions WHERE bioguide_id NOT LIKE 'LOCAL:%';
DELETE FROM portfolio_snapshots WHERE bioguide_id NOT LIKE 'LOCAL:%';
DELETE FROM members WHERE bioguide_id NOT LIKE 'LOCAL:%';
-- Idempotent re-seed of LOCAL disclosure rows (unique idx_financial_tx_dedup).
DELETE FROM financial_transactions WHERE bioguide_id LIKE 'LOCAL:%';

INSERT OR REPLACE INTO votes
  (chamber, congress, session, roll_number, bill_congress, bill_type, bill_number, question, result, yeas, nays, vote_date, is_passage)
VALUES
  ('House', 119, 2, 9001, 119, 'hr', 1, 'On Passage', 'Passed', 220, 213, '${D_RECENT}', 1),
  ('House', 119, 2, 9005, 119, 'hr', 1, 'On Agreeing to the Resolution', 'Passed', 218, 210, '${D_RECENT}', 0),
  ('Senate', 119, 2, 9002, 119, 's', 47, 'On Passage of the Bill', 'Passed', 68, 32, '${D_MID}', 1),
  ('Senate', 119, 2, 9006, 119, 's', 47, 'On the Cloture Motion', 'Agreed to', 60, 37, '${D_MID}', 0),
  ('House', 119, 2, 9003, 119, 'hr', 22, 'On Passage', 'Passed', 314, 117, '${D_OLDER}', 1),
  ('House', 119, 2, 9010, 119, 'hr', 88, 'On Passage', 'Passed', 210, 208, '${D_RECENT}', 1),
  ('House', 119, 2, 9012, 119, 'hr', 33, 'On Passage', 'Passed', 421, 1, '${D_MID}', 1);

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
   '${D_OLDER}T00:00:00.000Z', '${D_OLDER}T00:00:00.000Z'),
  (119, 'hr', 88, 'Knife-Edge Floor Resolution Act (local sample)', 'Congress',
   'Sample CRS-style summary seeded for local development. No live data was fetched.',
   '{"headline":"House passes a knife-edge resolution (local sample)","what_it_does":"Sets a near-tie House rule for the rest of the session and leaves almost no votes to spare.","key_points":["Passes on a 210-208 tally","Holds nearly every majority vote","Leaves a handful of cross-party defections"],"terms_explained":[{"term":"Knife-edge","plain":"A vote so close that a few switches would flip the result."}]}',
   '${D_RECENT}T00:00:00.000Z', '${D_RECENT}T00:00:00.000Z'),
  (119, 'hr', 33, 'Federal Contracting Sunshine Act (local sample)', 'Government Operations and Politics',
   'Sample CRS-style summary seeded for local development. No live data was fetched.',
   '{"headline":"House-passed contracting bill waiting in the Senate (local sample)","what_it_does":"Requires more public reporting after a contract is awarded and sends the House-passed text to a Senate committee.","key_points":["Passed the House nearly unanimously","Now waits in a Senate committee","Adds contractor disclosure rules"],"terms_explained":[{"term":"Second chamber","plain":"The other house of Congress, which must still act before a bill can become law."}]}',
   '${D_MID}T00:00:00.000Z', '${D_MID}T00:00:00.000Z');

INSERT OR REPLACE INTO bill_sponsors
  (congress, bill_type, bill_number, bioguide_id, state, full_name, party, is_primary, updated_at)
VALUES
  (119, 'hr', 1, 'LOCAL:H002', 'NY', 'Rep. Sample Loyal (local)', 'D', 1, '${D_RECENT}T00:00:00.000Z'),
  (119, 's', 47, 'LOCAL:S001', 'TX', 'Sen. Sample Crossover (local)', 'R', 1, '${D_MID}T00:00:00.000Z'),
  (119, 'hr', 22, 'LOCAL:H001', 'CA', 'Rep. Sample Crossover (local)', 'D', 1, '${D_OLDER}T00:00:00.000Z'),
  (119, 'hr', 88, 'LOCAL:H004', 'SC', 'Rep. Portfolio Loser (local)', 'R', 1, '${D_RECENT}T00:00:00.000Z'),
  (119, 'hr', 33, 'LOCAL:H002', 'NY', 'Rep. Sample Loyal (local)', 'D', 1, '${D_MID}T00:00:00.000Z');

INSERT OR REPLACE INTO bill_lifecycle
  (congress, bill_type, bill_number, introduced_date, presented_date, signed_date, vetoed_date, became_law_date, law_kind, public_law, latest_action_date, latest_action_text, updated_at)
VALUES
  (119, 'hr', 1, '${D_OLDER}', '${D_RECENT}', '${D_RECENT}', NULL, '${D_RECENT}', 'signed', '119-1',
   '${D_RECENT}', 'Became Public Law No: 119-1. (local sample)', '${D_RECENT}T00:00:00.000Z'),
  (119, 's', 47, '${D_OLDER}', '${D_MID}', NULL, NULL, '${D_MID}', 'law_unsigned', '119-2',
   '${D_MID}', 'Became Public Law No: 119-2 without signature. (local sample)', '${D_MID}T00:00:00.000Z'),
  (119, 'hr', 22, '${D_OLDER}', '${D_RECENT}', NULL, NULL, NULL, NULL, NULL,
   '${D_RECENT}', 'Presented to President. (local sample)', '${D_RECENT}T00:00:00.000Z');

INSERT OR REPLACE INTO committee_roster
  (congress, system_code, chamber, name, committee_type, parent_system_code, updated_at)
VALUES
  (119, 'hsif00', 'House', 'Energy and Commerce Committee', 'Standing', NULL, '${D_RECENT}T00:00:00.000Z'),
  (119, 'hsif14', 'House', 'Health Subcommittee', 'Subcommittee', 'hsif00', '${D_RECENT}T00:00:00.000Z'),
  (119, 'hsba00', 'House', 'Financial Services Committee', 'Standing', NULL, '${D_RECENT}T00:00:00.000Z'),
  (119, 'sshr00', 'Senate', 'Health, Education, Labor, and Pensions Committee', 'Standing', NULL, '${D_RECENT}T00:00:00.000Z');

DELETE FROM bill_committee_events WHERE congress = 119;

-- Process tables store normalizeBillType() casing (HR/S). Digests/votes may be
-- lowercase locally; process lookups use UPPER() so both match.
INSERT INTO bill_committee_events
  (congress, bill_type, bill_number, system_code, activity_key, activity_at, chamber, committee_name, parent_system_code, activity_raw, tally_text)
VALUES
  (119, 'HR', 1, 'hsif00', 'sent', '${D_OLDER}T12:00:00.000Z', 'House', 'Energy and Commerce Committee', NULL, 'Referred To', NULL),
  (119, 'HR', 1, 'hsif14', 'sent', '${D_OLDER}T15:00:00.000Z', 'House', 'Health Subcommittee', 'hsif00', 'Referred to', NULL),
  (119, 'HR', 1, 'hsif00', 'hearings', '${D_OLDER}T18:00:00.000Z', 'House', 'Energy and Commerce Committee', NULL, 'Hearings By', NULL),
  (119, 'HR', 1, 'hsif14', 'advanced', '${D_MID}T15:00:00.000Z', 'House', 'Health Subcommittee', 'hsif00', 'Reported by', NULL),
  (119, 'HR', 1, 'hsif00', 'advanced', '${D_MID}T18:00:00.000Z', 'House', 'Energy and Commerce Committee', NULL, 'Reported By', '47-0'),
  (119, 'HR', 22, 'hsba00', 'sent', '${D_OLDER}T12:00:00.000Z', 'House', 'Financial Services Committee', NULL, 'Referred To', NULL),
  (119, 'HR', 22, 'hsba00', 'worked_on', '${D_RECENT}T12:00:00.000Z', 'House', 'Financial Services Committee', NULL, 'Markup By', NULL),
  (119, 'HR', 33, 'hsif00', 'sent', '${D_OLDER}T12:00:00.000Z', 'House', 'Energy and Commerce Committee', NULL, 'Referred To', NULL),
  (119, 'HR', 33, 'hsif00', 'advanced', '${D_MID}T12:00:00.000Z', 'House', 'Energy and Commerce Committee', NULL, 'Reported By', '47-0'),
  (119, 'HR', 33, 'sshr00', 'sent', '${D_RECENT}T12:00:00.000Z', 'Senate', 'Health, Education, Labor, and Pensions Committee', NULL, 'Referred To', NULL),
  (119, 'S', 47, 'sshr00', 'sent', '${D_OLDER}T12:00:00.000Z', 'Senate', 'Health, Education, Labor, and Pensions Committee', NULL, 'Referred To', NULL),
  (119, 'S', 47, 'sshr00', 'released', '${D_MID}T12:00:00.000Z', 'Senate', 'Health, Education, Labor, and Pensions Committee', NULL, 'Discharged From', NULL),
  (119, 'HR', 9001, 'hsif00', 'sent', '${D_STUCK}T12:00:00.000Z', 'House', 'Energy and Commerce Committee', NULL, 'Referred To', NULL),
  (119, 'HR', 9002, 'hsif00', 'sent', '${D_STUCK}T12:00:00.000Z', 'House', 'Energy and Commerce Committee', NULL, 'Referred To', NULL),
  (119, 'HR', 9003, 'hsba00', 'sent', '${D_STUCK}T12:00:00.000Z', 'House', 'Financial Services Committee', NULL, 'Referred To', NULL),
  (119, 'S', 9001, 'sshr00', 'sent', '${D_STUCK}T12:00:00.000Z', 'Senate', 'Health, Education, Labor, and Pensions Committee', NULL, 'Referred To', NULL);

DELETE FROM bill_floor_events WHERE congress = 119;
INSERT INTO bill_floor_events
  (congress, bill_type, bill_number, action_key, action_at, chamber, label, raw_text, tally_text)
VALUES
  (119, 'HR', 1, 'calendar', '${D_MID}T20:00:00.000Z', 'House', 'Placed on the House calendar', 'Placed on the Union Calendar, Calendar No. 12. (local sample)', NULL),
  (119, 'HR', 1, 'received', '${D_RECENT}T18:00:00.000Z', 'Senate', 'Received in the Senate', 'Received in the Senate. (local sample)', NULL),
  (119, 'S', 47, 'considered', '${D_MID}T08:00:00.000Z', 'Senate', 'Debated in the Senate', 'Measure laid before Senate by unanimous consent. (local sample)', 'unanimous consent'),
  (119, 'HR', 22, 'calendar', '${D_OLDER}T16:00:00.000Z', 'House', 'Placed on the House calendar', 'Placed on the Union Calendar. (local sample)', NULL),
  (119, 'HR', 33, 'calendar', '${D_MID}T16:00:00.000Z', 'House', 'Placed on the House calendar', 'Placed on the Union Calendar. (local sample)', NULL),
  (119, 'HR', 33, 'received', '${D_RECENT}T10:00:00.000Z', 'Senate', 'Received in the Senate', 'Received in the Senate. (local sample)', NULL);

INSERT OR REPLACE INTO bill_text_changes
  (congress, bill_type, bill_number, summary_version, summary_version_date, latest_version, latest_version_date, added_json, more_added_count, checked_at)
VALUES
  (119, 'HR', 22, 'Introduced in House', '${D_OLDER}', 'Engrossed in House', '${D_OLDER}',
   '[{"label":"Sec. 4.","heading":"Public spending dashboard details"}]', 0, '${D_OLDER}T00:00:00.000Z');

INSERT OR REPLACE INTO nominations
  (congress, nomination_number, part_number, citation, description, organization, position_title,
   nominees_json, received_date, raw_background_text, background_json, created_at, updated_at)
VALUES
  (119, 100, 0, 'PN100',
   'Jane Doe, of California, to be Secretary of Energy. (local sample)',
   'Department of Energy', 'Secretary of Energy',
   '[{"display_name":"Jane Doe","state":"CA"}]',
   '${D_OLDER}',
   'Jane Doe, of California, to be Secretary of Energy. (local sample)
Position: Secretary of Energy (Department of Energy)
Nominee(s): Jane Doe (CA)',
   '{"headline":"Jane Doe confirmed as Energy Secretary (local sample)","what_was_confirmed":"The Senate confirmed Jane Doe as Secretary of Energy.","background":"Jane Doe of CA was confirmed as Secretary of Energy at the Department of Energy.","key_points":[],"wikipedia_url":"https://en.wikipedia.org/wiki/Jane_Doe","wikipedia_extract":"Jane Doe is an American energy executive and former California energy commissioner who led statewide grid reliability and clean-power programs before her nomination."}',
   '${D_RECENT}T00:00:00.000Z', '${D_RECENT}T00:00:00.000Z'),
  (119, 101, 0, 'PN101',
   'Alex Rivera, of Texas, to be an Assistant Secretary of State. (local sample)',
   'Department of State', 'Assistant Secretary of State',
   '[{"display_name":"Alex Rivera","state":"TX"}]',
   '${D_MID}',
   'Alex Rivera, of Texas, to be an Assistant Secretary of State. (local sample)
Position: Assistant Secretary of State (Department of State)
Nominee(s): Alex Rivera (TX)',
   '{"headline":"Alex Rivera confirmed for State Department post (local sample)","what_was_confirmed":"The Senate confirmed Alex Rivera as an Assistant Secretary of State.","background":"Alex Rivera of TX was confirmed as Assistant Secretary of State at the Department of State.","key_points":[],"wikipedia_url":"https://en.wikipedia.org/wiki/Alex_Rivera","wikipedia_extract":"Alex Rivera is an American diplomat and former Texas foreign-affairs adviser who worked on Western Hemisphere policy before joining the State Department."}',
   '${D_MID}T00:00:00.000Z', '${D_MID}T00:00:00.000Z');

INSERT OR REPLACE INTO confirmation_votes
  (chamber, congress, session, roll_number, nomination_congress, nomination_number, part_number,
   question, result, yeas, nays, vote_date)
VALUES
  ('Senate', 119, 2, 9101, 119, 100, 0, 'On the Nomination', 'Confirmed', 58, 40, '${D_RECENT}'),
  ('Senate', 119, 2, 9102, 119, 101, 0, 'On the Nomination', 'Confirmed', 62, 36, '${D_MID}');
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
    # Knife-edge 9010 (210–208 party-line): R Yea / D Nay, with a few named crossovers later.
    if party == "R":
        knife = "Nay" if idx <= 5 else "Yea"
    elif party == "D":
        knife = "Yea" if idx <= 2 else "Nay"
    else:
        knife = "Not Voting"
    vote_rows.append(f"  ('House', 119, 2, 9010, '{bid}', '{knife}')")

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
        # Extra 9010 votes do not replace 9001/9003, so H001 stays the 9001 crossover spotlight.
        if bid == "LOCAL:H001":
            knife = "Yea"  # D voting Yea against a Nay caucus
        elif bid == "LOCAL:H004":
            knife = "Nay"  # R voting Nay against a Yea caucus
        else:
            knife = "Nay"  # other House D spotlights stay with the D line
        vote_rows.append(f"  ('House', 119, 2, 9010, '{bid}', '{knife}')")
    else:
        position = "Nay" if bid == "LOCAL:S001" else "Yea"
        vote_rows.append(f"  ('Senate', 119, 2, 9002, '{bid}', '{position}')")

# Confirmation rolls 9101 (58–40) and 9102 (62–35): party-line contested confirms.
# R all Yea; most D Nay; Independents present but not counted in yea/nay tallies below.
senate_voters = [("LOCAL:S001", "R"), ("LOCAL:S002", "R")]
for idx, party in enumerate(senate_rest, start=1):
    senate_voters.append((f"LOCAL:SR{idx:03d}", party))

r_voters = [bid for bid, party in senate_voters if party == "R"]
d_voters = [bid for bid, party in senate_voters if party == "D"]
# 9101: R 53–0 · D 5–40  → 58–40
for bid in r_voters:
    vote_rows.append(f"  ('Senate', 119, 2, 9101, '{bid}', 'Yea')")
for i, bid in enumerate(d_voters):
    vote_rows.append(f"  ('Senate', 119, 2, 9101, '{bid}', '{'Yea' if i < 5 else 'Nay'}')")
# 9102: R 53–0 · D 9–36 → 62–36
for bid in r_voters:
    vote_rows.append(f"  ('Senate', 119, 2, 9102, '{bid}', 'Yea')")
for i, bid in enumerate(d_voters):
    vote_rows.append(f"  ('Senate', 119, 2, 9102, '{bid}', '{'Yea' if i < 9 else 'Nay'}')")

print("INSERT OR REPLACE INTO members (bioguide_id, name, chamber, party, state, district, updated_at) VALUES")
print(",\n".join(member_rows) + ";")
print("")
print("INSERT OR REPLACE INTO member_votes (chamber, congress, session, roll_number, bioguide_id, position) VALUES")
print(",\n".join(vote_rows) + ";")

# Precomputed profile stats (mirrors applyRollToMemberSessionStats for the sample rolls).
# Spotlight crossovers vote against their party majority on the seeded rolls.
stats_rows = []
cross_rows = []
for bid, _, chamber, party, _, _, ts in spotlight_members:
    if chamber == "House":
        if bid in ("LOCAL:H001", "LOCAL:H002"):
            roll, bill_type, bill_number, vote_date, yeas, nays = 9001, "hr", 1, "${D_RECENT}", 220, 213
            position = "nay" if bid == "LOCAL:H001" else "yea"
        else:
            roll, bill_type, bill_number, vote_date, yeas, nays = 9003, "hr", 22, "${D_OLDER}", 314, 117
            position = "yea"
        # House Democrats majority Yea on 9001; H001 (D/Nay) is the crossover.
        crossed = bid == "LOCAL:H001"
    else:
        roll, bill_type, bill_number, vote_date, yeas, nays = 9002, "s", 47, "${D_MID}", 68, 32
        position = "nay" if bid == "LOCAL:S001" else "yea"
        crossed = bid == "LOCAL:S001"

    yea_count = 1 if position == "yea" else 0
    nay_count = 1 if position == "nay" else 0
    cross_count = 1 if crossed else 0
    stats_rows.append(
        f"  ('{bid}', 119, 2, 1, {yea_count}, {nay_count}, {cross_count}, '{ts}')"
    )
    if crossed:
        party_line = "yea"
        margin = abs(yeas - nays)
        cross_rows.append(
            f"  ('{chamber}', 119, 2, {roll}, '{bid}', '{bill_type}', {bill_number}, 119, '{vote_date}', '{position}', '{party_line}', {margin})"
        )

# Fill members: one Yea each, party-line, no crosses.
for idx, party in enumerate(house_rest, start=1):
    bid = f"LOCAL:HR{idx:04d}"
    stats_rows.append(f"  ('{bid}', 119, 2, 1, 1, 0, 0, '{updated}')")
for idx, party in enumerate(senate_rest, start=1):
    bid = f"LOCAL:SR{idx:03d}"
    stats_rows.append(f"  ('{bid}', 119, 2, 1, 1, 0, 0, '{updated}')")

print("")
print("INSERT OR REPLACE INTO member_session_stats (bioguide_id, congress, session, votes_cast, yea_count, nay_count, cross_vote_count, updated_at) VALUES")
print(",\n".join(stats_rows) + ";")
if cross_rows:
    print("")
    print("INSERT OR REPLACE INTO member_cross_votes (chamber, congress, session, roll_number, bioguide_id, bill_type, bill_number, bill_congress, vote_date, position, party_line, margin) VALUES")
    print(",\n".join(cross_rows) + ";")
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

if [[ "${SEED_PRINT_CMD:-}" == "1" ]]; then
  if [[ -n "${SEED_PERSIST_TO:-}" ]]; then
    echo "npx wrangler d1 execute ${DB_NAME} --local --persist-to ${SEED_PERSIST_TO} --file <seed.sql>"
  else
    echo "npx wrangler d1 execute ${DB_NAME} --local --file <seed.sql>"
  fi
  exit 0
fi

SEED_FILE="$(mktemp -t seed-local-feed.XXXXXX.sql)"
trap 'rm -f "${SEED_FILE}"' EXIT
{
  printf '%s\n' "${SEED_SQL}"
  generate_roster_sql
  printf '%s\n' "${SEED_TAIL}"
} >"${SEED_FILE}"

echo "Seeding local D1 (${DB_NAME}) with sample passage votes, digests, and left-rail member spotlights..."
# --local only. SEED_PERSIST_TO (when set) keeps this off the default store.
# Branch instead of an empty-array expand so macOS bash 3.2 + set -u is safe.
if [[ -n "${SEED_PERSIST_TO:-}" ]]; then
  mkdir -p "${SEED_PERSIST_TO}"
  echo "Isolated persist dir: ${SEED_PERSIST_TO} (does not touch default .wrangler/state or production/preview D1)."
  ( cd "${WORKER_DIR}" && npx wrangler d1 execute "${DB_NAME}" --local --persist-to "${SEED_PERSIST_TO}" --file "${SEED_FILE}" )
else
  ( cd "${WORKER_DIR}" && npx wrangler d1 execute "${DB_NAME}" --local --file "${SEED_FILE}" )
fi

cat <<'DONE'

Local feed + House/Senate left-rail spotlights seeded. Next:
  npm run dev:worker   # http://127.0.0.1:8787
  npm run dev:web      # http://127.0.0.1:5173
  curl -fsS http://127.0.0.1:8787/feed/latest.json
  curl -fsS 'http://127.0.0.1:8787/stats/defectors.json?chamber=House&limit=5'
  curl -fsS 'http://127.0.0.1:8787/stats/portfolios.json?chamber=House&limit=5'

Seeded rows are clearly marked "(local sample)" and contain no live data.
Re-run npm run seed after members-roster / member-votes if the left rail goes empty
(those pipelines load a real roster that hides LOCAL:* sample spotlights).
DONE
