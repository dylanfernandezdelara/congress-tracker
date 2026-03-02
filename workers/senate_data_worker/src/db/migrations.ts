export const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS ingestion_runs (
    run_id TEXT PRIMARY KEY,
    trigger_type TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    window_start TEXT,
    window_end TEXT,
    partial INTEGER NOT NULL DEFAULT 0,
    error_json TEXT,
    row_writes INTEGER NOT NULL DEFAULT 0,
    row_reads INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS publish_pointer (
    dataset TEXT PRIMARY KEY,
    active_run_id TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS members_dim (
    run_id TEXT NOT NULL,
    bioguide_id TEXT NOT NULL,
    name TEXT NOT NULL,
    party TEXT NOT NULL,
    state TEXT NOT NULL,
    chamber TEXT NOT NULL,
    PRIMARY KEY (run_id, bioguide_id)
  )`,
  `CREATE TABLE IF NOT EXISTS bills_dim (
    run_id TEXT NOT NULL,
    bill_key TEXT NOT NULL,
    congress INTEGER NOT NULL,
    bill_type TEXT NOT NULL,
    bill_number TEXT NOT NULL,
    title TEXT,
    policy_area TEXT,
    introduced_date TEXT,
    latest_action_date TEXT,
    summary_json TEXT,
    subjects_json TEXT,
    committees_json TEXT,
    impact_evidence_json TEXT,
    analysis_json TEXT,
    PRIMARY KEY (run_id, bill_key)
  )`,
  `CREATE TABLE IF NOT EXISTS votes_fact (
    run_id TEXT NOT NULL,
    vote_id TEXT NOT NULL,
    congress INTEGER NOT NULL,
    session INTEGER NOT NULL,
    vote_number INTEGER NOT NULL,
    vote_date TEXT NOT NULL,
    title TEXT NOT NULL,
    question TEXT NOT NULL,
    result TEXT NOT NULL,
    issue TEXT,
    issue_type TEXT,
    bill_key TEXT,
    yeas INTEGER,
    nays INTEGER,
    present_count INTEGER,
    absent_count INTEGER,
    PRIMARY KEY (run_id, vote_id)
  )`,
  `CREATE TABLE IF NOT EXISTS vote_member_fact (
    run_id TEXT NOT NULL,
    vote_id TEXT NOT NULL,
    bioguide_id TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL,
    party TEXT NOT NULL,
    vote_cast TEXT NOT NULL,
    against_party_majority INTEGER,
    PRIMARY KEY (run_id, vote_id, state, party, vote_cast, bioguide_id)
  )`,
  `CREATE TABLE IF NOT EXISTS member_activity_fact (
    run_id TEXT NOT NULL,
    activity_id TEXT NOT NULL,
    activity_date TEXT NOT NULL,
    bioguide_id TEXT NOT NULL,
    state TEXT NOT NULL,
    source TEXT NOT NULL,
    type TEXT NOT NULL,
    role TEXT,
    bill_key TEXT,
    is_recent INTEGER,
    payload_json TEXT NOT NULL,
    PRIMARY KEY (run_id, activity_id)
  )`,
  `CREATE TABLE IF NOT EXISTS member_daily_metrics (
    run_id TEXT NOT NULL,
    metric_date TEXT NOT NULL,
    bioguide_id TEXT NOT NULL,
    state TEXT NOT NULL,
    activity_score REAL NOT NULL,
    defection_count INTEGER NOT NULL,
    sponsored_count INTEGER NOT NULL,
    cosponsored_count INTEGER NOT NULL,
    vote_count INTEGER NOT NULL,
    PRIMARY KEY (run_id, metric_date, bioguide_id)
  )`,
  `CREATE TABLE IF NOT EXISTS state_daily_metrics (
    run_id TEXT NOT NULL,
    metric_date TEXT NOT NULL,
    state TEXT NOT NULL,
    votes_count INTEGER NOT NULL,
    defection_count INTEGER NOT NULL,
    PRIMARY KEY (run_id, metric_date, state)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_votes_fact_run_date_num ON votes_fact(run_id, vote_date DESC, vote_number DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_votes_fact_run_issue_date_num ON votes_fact(run_id, issue_type, vote_date DESC, vote_number DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_vote_member_fact_lookup ON vote_member_fact(run_id, state, party, vote_cast, vote_id)`,
  `CREATE INDEX IF NOT EXISTS idx_member_daily_metrics_lookup ON member_daily_metrics(run_id, metric_date, state, activity_score DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_member_activity_fact_lookup ON member_activity_fact(run_id, bioguide_id, activity_date DESC, type, source)`,
  `CREATE INDEX IF NOT EXISTS idx_state_daily_metrics_lookup ON state_daily_metrics(run_id, state, metric_date DESC)`
];

export async function runMigrations(db: D1Database): Promise<void> {
  for (const sql of MIGRATIONS) {
    await db.exec(sql);
  }
}
