ALTER TABLE votes ADD COLUMN issue_key TEXT;

UPDATE votes
SET issue_key = thread_key
WHERE issue_key IS NULL;

CREATE INDEX IF NOT EXISTS idx_votes_issue_key
  ON votes (issue_key, vote_date DESC, congress DESC, session DESC, vote_number DESC);
