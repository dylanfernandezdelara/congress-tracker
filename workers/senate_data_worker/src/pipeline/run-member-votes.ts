import type { Env } from "../config";
import { congressNumber, sessionNumber } from "../config";
import { MEMBER_VOTES_MAX_ROLLS_PER_RUN } from "../constants";
import { upsertMembersBatch } from "../d1/members";
import {
  countMemberVotesForRoll,
  selectPassageRollCalls,
  upsertMemberVotesBatch,
} from "../d1/member-votes";
import { ensureSchema } from "../d1/schema";
import { fetchHouseMemberVotes } from "../sources/house-member-votes";
import { fetchSenateMemberVotes } from "../sources/senate-member-votes";
import type { MemberRecord } from "../types";

export interface RunMemberVotesResult {
  rollsProcessed: number;
  rollsSkipped: number;
  rollsRemaining: number;
  membersUpserted: number;
  votesUpserted: number;
}

/**
 * Backfill per-member positions for passage roll calls. Writes are batched
 * (one atomic D1 batch per roll) and capped at
 * MEMBER_VOTES_MAX_ROLLS_PER_RUN rolls per invocation to stay under the Worker
 * subrequest limit. Re-invoke until `rollsRemaining` is 0.
 */
export async function runMemberVotesPipeline(env: Env): Promise<RunMemberVotesResult> {
  const congress = congressNumber(env);
  const session = sessionNumber(env);
  await ensureSchema(env.DB);
  const rolls = await selectPassageRollCalls(env.DB, congress, session);

  let rollsProcessed = 0;
  let rollsSkipped = 0;
  let membersUpserted = 0;
  let votesUpserted = 0;
  // Dedupe member upserts across rolls — the same member appears on every roll.
  const seenMembers = new Set<string>();

  let index = 0;
  for (; index < rolls.length; index += 1) {
    if (rollsProcessed >= MEMBER_VOTES_MAX_ROLLS_PER_RUN) break;
    const roll = rolls[index];

    const existing = await countMemberVotesForRoll(env.DB, roll);
    if (existing > 0) {
      rollsSkipped += 1;
      continue;
    }

    const fetched =
      roll.chamber === "House"
        ? await fetchHouseMemberVotes(env, roll.congress, roll.session, roll.roll_number)
        : await fetchSenateMemberVotes(env, roll.congress, roll.session, roll.roll_number);

    if (fetched.votes.length === 0) {
      rollsSkipped += 1;
      continue;
    }

    const newMembers: MemberRecord[] = [];
    for (const member of fetched.members) {
      if (seenMembers.has(member.bioguideId)) continue;
      seenMembers.add(member.bioguideId);
      newMembers.push(member);
    }

    // Members first so a votes-batch failure leaves the roll empty (existing=0)
    // and it is safely retried on the next run.
    await upsertMembersBatch(env.DB, newMembers);
    await upsertMemberVotesBatch(env.DB, fetched.votes);
    membersUpserted += newMembers.length;
    votesUpserted += fetched.votes.length;
    rollsProcessed += 1;
  }

  return {
    rollsProcessed,
    rollsSkipped,
    rollsRemaining: Math.max(0, rolls.length - index),
    membersUpserted,
    votesUpserted,
  };
}
