import type { Env } from "../config";
import { congressNumber, sessionNumber } from "../config";
import { MEMBER_VOTES_MAX_ROLLS_PER_RUN } from "../constants";
import {
  upsertMembersBatch,
  buildSenateBioguideLookup,
  hasRealMemberRoster,
} from "../d1/members";
import {
  countMemberVotesForRoll,
  countLisMemberVotesForRoll,
  deleteMemberVotesForRoll,
  selectPassageRollCalls,
  upsertMemberVotesBatch,
} from "../d1/member-votes";
import { ensureSchema } from "../d1/schema";
import { fetchHouseMemberVotes } from "../sources/house-member-votes";
import { fetchSenateMemberVotes } from "../sources/senate-member-votes";
import { runMembersRosterPipeline } from "./run-members-roster";
import type { MemberRecord, MemberVoteRecord } from "../types";

export interface RunMemberVotesResult {
  /** Successful roll ingest writes this run. */
  rollsProcessed: number;
  /** Rolls skipped (already complete, empty upstream, or fetch error). */
  rollsSkipped: number;
  /** Upstream fetches attempted this run (success, empty, or error). */
  rollsAttempted: number;
  rollsRemaining: number;
  membersUpserted: number;
  votesUpserted: number;
}

/**
 * Backfill per-member positions for passage roll calls. Writes are batched
 * (one atomic D1 batch per roll) and capped at
 * MEMBER_VOTES_MAX_ROLLS_PER_RUN upstream fetches per invocation to stay under
 * the Worker subrequest limit. Re-invoke until `rollsRemaining` is 0.
 *
 * Syncs the Congress.gov member roster first when the D1 members table lacks a
 * full real roster (needed for Senate LIS → bioguide resolution and photos).
 */
export async function runMemberVotesPipeline(env: Env): Promise<RunMemberVotesResult> {
  const congress = congressNumber(env);
  const session = sessionNumber(env);
  await ensureSchema(env.DB);

  if (!(await hasRealMemberRoster(env.DB)) && env.CONGRESS_API_KEY?.trim()) {
    await runMembersRosterPipeline(env);
  }

  const senateBioguideLookup = await buildSenateBioguideLookup(env.DB);
  const rolls = await selectPassageRollCalls(env.DB, congress, session);

  let rollsProcessed = 0;
  let rollsSkipped = 0;
  let rollsAttempted = 0;
  let membersUpserted = 0;
  let votesUpserted = 0;
  // Dedupe member upserts across rolls — the same member appears on every roll.
  const seenMembers = new Set<string>();

  let index = 0;
  for (; index < rolls.length; index += 1) {
    if (rollsAttempted >= MEMBER_VOTES_MAX_ROLLS_PER_RUN) break;
    const roll = rolls[index];

    const existing = await countMemberVotesForRoll(env.DB, roll);
    const lisUnresolved =
      existing > 0 ? await countLisMemberVotesForRoll(env.DB, roll) : 0;
    if (existing > 0 && lisUnresolved === 0) {
      rollsSkipped += 1;
      continue;
    }

    // Fetch before delete so a failed upstream leaves prior rows intact.
    rollsAttempted += 1;
    let fetched: { members: MemberRecord[]; votes: MemberVoteRecord[] };
    try {
      fetched =
        roll.chamber === "House"
          ? await fetchHouseMemberVotes(env, roll.congress, roll.session, roll.roll_number)
          : await fetchSenateMemberVotes(env, roll.congress, roll.session, roll.roll_number, {
              senateBioguideLookup,
            });
    } catch (err: unknown) {
      // One chamber/source outage (e.g. Senate.gov 403) must not block the rest.
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        JSON.stringify({
          event: "member_votes_roll_fetch_failed",
          chamber: roll.chamber,
          congress: roll.congress,
          session: roll.session,
          roll_number: roll.roll_number,
          error: message,
        })
      );
      rollsSkipped += 1;
      continue;
    }

    if (fetched.votes.length === 0) {
      rollsSkipped += 1;
      continue;
    }

    if (lisUnresolved > 0) {
      await deleteMemberVotesForRoll(env.DB, roll);
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
    rollsAttempted,
    rollsRemaining: Math.max(0, rolls.length - index),
    membersUpserted,
    votesUpserted,
  };
}
