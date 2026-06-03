export async function readPipelineStatus(db: D1Database) {
  // Miniflare's local D1 occasionally throws internal errors when this debug
  // endpoint fans out multiple reads at once. Keep these reads serialized so
  // the local status inspector stays stable.
  const voteStats =
    (await db
      .prepare(
        "SELECT COUNT(*) AS total_votes, MIN(vote_date) AS earliest_vote_date, MAX(vote_date) AS latest_vote_date FROM votes"
      )
      .first<Record<string, unknown>>()) ?? null;
  const checkpointStats = await db
    .prepare(
      "SELECT checkpoint_key, cursor_json, updated_at FROM pipeline_checkpoints ORDER BY checkpoint_key"
    )
    .all<Record<string, unknown>>();

  return {
    votes: voteStats,
    checkpoints: checkpointStats.results ?? [],
  };
}
