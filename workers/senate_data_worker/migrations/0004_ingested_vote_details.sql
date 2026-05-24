CREATE TABLE IF NOT EXISTS ingested_vote_details (
  congress INTEGER NOT NULL,
  session INTEGER NOT NULL,
  vote_number INTEGER NOT NULL,
  vote_date TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'senate_xml',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (congress, session, vote_number)
);

CREATE INDEX IF NOT EXISTS idx_ingested_vote_details_date
  ON ingested_vote_details (congress, session, vote_date DESC, vote_number DESC);
