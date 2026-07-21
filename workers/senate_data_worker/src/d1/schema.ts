const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS votes (
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
)`,
  `CREATE TABLE IF NOT EXISTS bill_digests (
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
)`,
  `CREATE TABLE IF NOT EXISTS members (
  bioguide_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  chamber TEXT NOT NULL,
  party TEXT,
  state TEXT,
  district INTEGER,
  updated_at TEXT NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS member_votes (
  chamber TEXT NOT NULL,
  congress INTEGER NOT NULL,
  session INTEGER NOT NULL,
  roll_number INTEGER NOT NULL,
  bioguide_id TEXT NOT NULL,
  position TEXT NOT NULL,
  PRIMARY KEY (chamber, congress, session, roll_number, bioguide_id)
)`,
  `CREATE TABLE IF NOT EXISTS member_session_stats (
  bioguide_id TEXT NOT NULL,
  congress INTEGER NOT NULL,
  session INTEGER NOT NULL,
  votes_cast INTEGER NOT NULL,
  yea_count INTEGER NOT NULL,
  nay_count INTEGER NOT NULL,
  cross_vote_count INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (bioguide_id, congress, session)
)`,
  `CREATE TABLE IF NOT EXISTS member_cross_votes (
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
)`,
  `CREATE TABLE IF NOT EXISTS financial_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bioguide_id TEXT NOT NULL,
  ticker TEXT,
  asset_description TEXT,
  transaction_type TEXT NOT NULL,
  amount_min INTEGER,
  amount_max INTEGER,
  transaction_date TEXT NOT NULL,
  filed_date TEXT NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  bioguide_id TEXT NOT NULL,
  as_of_date TEXT NOT NULL,
  estimated_value_usd REAL,
  session_return_pct REAL NOT NULL,
  PRIMARY KEY (bioguide_id, as_of_date)
)`,
  `CREATE TABLE IF NOT EXISTS pipeline_state (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS notable_vote_blurbs (
  chamber TEXT NOT NULL,
  congress INTEGER NOT NULL,
  session INTEGER NOT NULL,
  roll_number INTEGER NOT NULL,
  why_it_matters TEXT NOT NULL,
  detection_method TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (chamber, congress, session, roll_number)
)`,
  `CREATE TABLE IF NOT EXISTS bill_lifecycle (
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
)`,
  `CREATE TABLE IF NOT EXISTS executive_posts (
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
)`,
  `CREATE TABLE IF NOT EXISTS executive_post_bills (
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
)`,
  `CREATE INDEX IF NOT EXISTS idx_executive_posts_posted ON executive_posts (posted_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_executive_post_bills_bill ON executive_post_bills (bill_congress, bill_type, bill_number)`,
  `CREATE INDEX IF NOT EXISTS idx_votes_passage_date ON votes (is_passage, vote_date)`,
  `CREATE INDEX IF NOT EXISTS idx_votes_bill ON votes (bill_congress, bill_type, bill_number)`,
  `CREATE INDEX IF NOT EXISTS idx_votes_congress_session ON votes (congress, session, chamber)`,
  `CREATE INDEX IF NOT EXISTS idx_member_votes_roll ON member_votes (chamber, congress, session, roll_number)`,
  `CREATE INDEX IF NOT EXISTS idx_members_chamber ON members (chamber)`,
  `CREATE INDEX IF NOT EXISTS idx_financial_bioguide ON financial_transactions (bioguide_id)`,
  `DELETE FROM financial_transactions
   WHERE id NOT IN (
     SELECT MIN(id)
     FROM financial_transactions
     GROUP BY
       bioguide_id,
       COALESCE(ticker, ''),
       transaction_type,
       transaction_date,
       filed_date,
       COALESCE(amount_min, -1),
       COALESCE(amount_max, -1)
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_financial_tx_dedup ON financial_transactions (
    bioguide_id,
    COALESCE(ticker, ''),
    transaction_type,
    transaction_date,
    filed_date,
    COALESCE(amount_min, -1),
    COALESCE(amount_max, -1)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_member_votes_bioguide ON member_votes (bioguide_id)`,
  `CREATE INDEX IF NOT EXISTS idx_member_session_stats_session ON member_session_stats (congress, session)`,
  `CREATE INDEX IF NOT EXISTS idx_member_cross_votes_bioguide ON member_cross_votes (bioguide_id, congress, session, vote_date DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_member_cross_votes_roll ON member_cross_votes (chamber, congress, session, roll_number)`,
];

let schemaApplied = false;

export async function ensureSchema(db: D1Database): Promise<void> {
  if (schemaApplied) return;
  for (const sql of SCHEMA_STATEMENTS) {
    await db.prepare(sql).run();
  }
  schemaApplied = true;
}

/** Reset flag for tests. */
export function resetSchemaFlag(): void {
  schemaApplied = false;
}
