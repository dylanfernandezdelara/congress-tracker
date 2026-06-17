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
  `CREATE INDEX IF NOT EXISTS idx_votes_passage_date ON votes (is_passage, vote_date)`,
  `CREATE INDEX IF NOT EXISTS idx_votes_bill ON votes (bill_congress, bill_type, bill_number)`,
  `CREATE INDEX IF NOT EXISTS idx_votes_congress_session ON votes (congress, session, chamber)`,
  `CREATE INDEX IF NOT EXISTS idx_member_votes_roll ON member_votes (chamber, congress, session, roll_number)`,
  `CREATE INDEX IF NOT EXISTS idx_members_chamber ON members (chamber)`,
  `CREATE INDEX IF NOT EXISTS idx_financial_bioguide ON financial_transactions (bioguide_id)`,
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
