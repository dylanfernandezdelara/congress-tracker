import type { Env } from "../config";
import { congressNumber, sessionNumber } from "../config";
import { upsertMember } from "../d1/members";
import {
  countMemberVotesForRoll,
  selectPassageRollCalls,
  upsertMemberVote,
} from "../d1/member-votes";
import { fetchHouseMemberVotes } from "../sources/house-member-votes";
import { fetchSenateMemberVotes } from "../sources/senate-member-votes";

export interface RunMemberVotesResult {
  rollsProcessed: number;
  rollsSkipped: number;
  membersUpserted: number;
  votesUpserted: number;
}

export async function runMemberVotesPipeline(env: Env): Promise<RunMemberVotesResult> {
  const congress = congressNumber(env);
  const session = sessionNumber(env);
  const rolls = await selectPassageRollCalls(env.DB, congress, session);

  let rollsProcessed = 0;
  let rollsSkipped = 0;
  let membersUpserted = 0;
  let votesUpserted = 0;

  for (const roll of rolls) {
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

    for (const member of fetched.members) {
      await upsertMember(env.DB, member);
      membersUpserted += 1;
    }
    for (const vote of fetched.votes) {
      await upsertMemberVote(env.DB, vote);
      votesUpserted += 1;
    }
    rollsProcessed += 1;
  }

  return { rollsProcessed, rollsSkipped, membersUpserted, votesUpserted };
}
