CREATE TABLE IF NOT EXISTS kv_documents (
  doc_key      TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  body         TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
