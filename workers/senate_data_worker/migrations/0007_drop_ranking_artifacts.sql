-- Remove legacy LLM-style ranking artifacts (importance_scores, vote/bill score columns).
DROP TABLE IF EXISTS importance_scores;

ALTER TABLE votes DROP COLUMN significance;
ALTER TABLE votes DROP COLUMN score;

ALTER TABLE bills DROP COLUMN significance;
