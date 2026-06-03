-- Drop never-written read-model tables. The vote-detail and briefing payloads
-- materialized into vote_read_models / daily_briefings are the single source of
-- truth for arguments and source coverage; these tables had read paths but no
-- writers, so they only created serve-time split-brain.
DROP INDEX IF EXISTS idx_argument_excerpts_vote_lookup;
DROP TABLE IF EXISTS argument_excerpts;
DROP TABLE IF EXISTS party_argument_summaries;
DROP TABLE IF EXISTS record_documents;
