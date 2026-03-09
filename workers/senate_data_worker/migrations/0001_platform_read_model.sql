CREATE TABLE IF NOT EXISTS votes (
  congress INTEGER NOT NULL,
  session INTEGER NOT NULL,
  vote_number INTEGER NOT NULL,
  vote_date TEXT NOT NULL,
  title TEXT NOT NULL,
  question TEXT NOT NULL,
  result TEXT NOT NULL,
  issue TEXT,
  bill_key TEXT,
  policy_area TEXT,
  thread_key TEXT NOT NULL,
  status TEXT NOT NULL,
  significance TEXT NOT NULL,
  score INTEGER NOT NULL,
  summary TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (congress, session, vote_number)
);

CREATE TABLE IF NOT EXISTS vote_members (
  congress INTEGER NOT NULL,
  session INTEGER NOT NULL,
  vote_number INTEGER NOT NULL,
  bioguide_id TEXT NOT NULL,
  name TEXT NOT NULL,
  party TEXT NOT NULL,
  state TEXT NOT NULL,
  vote_cast TEXT NOT NULL,
  against_party_majority INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (congress, session, vote_number, bioguide_id)
);

CREATE TABLE IF NOT EXISTS bills (
  bill_key TEXT PRIMARY KEY,
  congress INTEGER NOT NULL,
  bill_type TEXT NOT NULL,
  bill_number TEXT NOT NULL,
  title TEXT,
  summary TEXT,
  policy_area TEXT,
  url TEXT,
  significance TEXT,
  category TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS issue_threads (
  thread_key TEXT PRIMARY KEY,
  display_title TEXT NOT NULL,
  policy_area TEXT,
  bill_key TEXT,
  recurrence_count INTEGER NOT NULL,
  last_vote_date TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS issue_thread_votes (
  thread_key TEXT NOT NULL,
  congress INTEGER NOT NULL,
  session INTEGER NOT NULL,
  vote_number INTEGER NOT NULL,
  PRIMARY KEY (thread_key, congress, session, vote_number)
);

CREATE TABLE IF NOT EXISTS importance_scores (
  congress INTEGER NOT NULL,
  session INTEGER NOT NULL,
  vote_number INTEGER NOT NULL,
  score INTEGER NOT NULL,
  reasons_json TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  PRIMARY KEY (congress, session, vote_number)
);

CREATE TABLE IF NOT EXISTS record_documents (
  document_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  document_date TEXT,
  url TEXT,
  thread_key TEXT,
  metadata_json TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS argument_excerpts (
  excerpt_id TEXT PRIMARY KEY,
  congress INTEGER NOT NULL,
  session INTEGER NOT NULL,
  vote_number INTEGER NOT NULL,
  party TEXT,
  source_document_id TEXT,
  source_type TEXT NOT NULL,
  source_label TEXT NOT NULL,
  source_url TEXT,
  excerpt_text TEXT,
  note TEXT,
  document_date TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS party_argument_summaries (
  congress INTEGER NOT NULL,
  session INTEGER NOT NULL,
  vote_number INTEGER NOT NULL,
  party TEXT NOT NULL,
  stance TEXT NOT NULL,
  summary_text TEXT NOT NULL,
  confidence TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  excerpt_ids_json TEXT NOT NULL,
  coverage_note TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (congress, session, vote_number, party)
);

CREATE TABLE IF NOT EXISTS historical_context (
  congress INTEGER NOT NULL,
  session INTEGER NOT NULL,
  vote_number INTEGER NOT NULL,
  thread_key TEXT NOT NULL,
  recurrence_count INTEGER NOT NULL,
  last_comparable_vote_json TEXT,
  related_votes_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (congress, session, vote_number)
);

CREATE TABLE IF NOT EXISTS daily_briefings (
  briefing_key TEXT PRIMARY KEY,
  generated_at TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vote_read_models (
  detail_key TEXT PRIMARY KEY,
  congress INTEGER NOT NULL,
  session INTEGER NOT NULL,
  vote_number INTEGER NOT NULL,
  generated_at TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_votes_vote_date
  ON votes (vote_date DESC, congress, session, vote_number);

CREATE INDEX IF NOT EXISTS idx_votes_thread_key
  ON votes (thread_key, vote_date DESC, vote_number DESC);

CREATE INDEX IF NOT EXISTS idx_vote_members_vote_lookup
  ON vote_members (congress, session, vote_number, party);

CREATE INDEX IF NOT EXISTS idx_issue_thread_votes_lookup
  ON issue_thread_votes (congress, session, vote_number, thread_key);

CREATE INDEX IF NOT EXISTS idx_argument_excerpts_vote_lookup
  ON argument_excerpts (congress, session, vote_number, party);

CREATE INDEX IF NOT EXISTS idx_vote_read_models_lookup
  ON vote_read_models (congress, session, vote_number);
