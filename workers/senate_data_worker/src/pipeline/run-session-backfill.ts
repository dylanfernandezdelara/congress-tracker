import type { Env } from "../config";
import { congressNumber, sessionNumber } from "../config";
import { SESSION_BACKFILL_MAX_NEW_VOTES } from "../constants";
import { selectExistingVoteKeysForSession, upsertVote } from "../d1/votes";
import { ingestPassageVotesByChamber } from "./ingest-chambers";

export interface RunSessionBackfillResult {
  votesUpserted: number;
  votesSkipped: number;
  votesRemaining: number;
}

export async function runSessionBackfillPipeline(env: Env): Promise<RunSessionBackfillResult> {
  const congress = congressNumber(env);
  const session = sessionNumber(env);
  const knownVoteKeys = await selectExistingVoteKeysForSession(env.DB, congress, session);

  const { house: houseResult, senate: senateResult } = await ingestPassageVotesByChamber(
    env,
    null,
    knownVoteKeys,
    { houseMaxNewVotes: SESSION_BACKFILL_MAX_NEW_VOTES }
  );

  const newVotes = [...houseResult.votes, ...senateResult.votes];
  for (const vote of newVotes) {
    await upsertVote(env.DB, vote);
  }

  const votesRemaining =
    houseResult.truncated === true || newVotes.length >= SESSION_BACKFILL_MAX_NEW_VOTES ? 1 : 0;

  return {
    votesUpserted: newVotes.length,
    votesSkipped: houseResult.skipped + senateResult.skipped,
    votesRemaining,
  };
}
