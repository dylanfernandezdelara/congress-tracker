CREATE TABLE IF NOT EXISTS source_fetch_log (
  cache_key TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  entity_key TEXT NOT NULL,
  request_url TEXT NOT NULL,
  status_code INTEGER,
  content_type TEXT,
  artifact_key TEXT,
  fetched_at TEXT NOT NULL,
  error_message TEXT,
  metadata_json TEXT
);

CREATE TABLE IF NOT EXISTS pipeline_checkpoints (
  checkpoint_key TEXT PRIMARY KEY,
  cursor_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_source_fetch_lookup
  ON source_fetch_log (source, entity_key, fetched_at DESC);
