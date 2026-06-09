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
