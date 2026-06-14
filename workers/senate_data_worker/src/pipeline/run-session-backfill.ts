import type { Env } from "../config";
import { congressNumber, sessionNumber } from "../config";
import { selectExistingVoteKeysForSession, upsertVote } from "../d1/votes";
import { ingestHousePassageVotes } from "../sources/house-votes";
import { ingestSenatePassageVotes } from "../sources/senate-votes";

export interface RunSessionBackfillResult {
  votesUpserted: number;
  votesSkipped: number;
}

export async function runSessionBackfillPipeline(env: Env): Promise<RunSessionBackfillResult> {
  const congress = congressNumber(env);
  const session = sessionNumber(env);
  const knownVoteKeys = await selectExistingVoteKeysForSession(env.DB, congress, session);

  const [houseResult, senateResult] = await Promise.all([
    ingestHousePassageVotes(env, null, knownVoteKeys),
    ingestSenatePassageVotes(env, null, knownVoteKeys),
  ]);

  const newVotes = [...houseResult.votes, ...senateResult.votes];
  for (const vote of newVotes) {
    await upsertVote(env.DB, vote);
  }

  return {
    votesUpserted: newVotes.length,
    votesSkipped: houseResult.skipped + senateResult.skipped,
  };
}
