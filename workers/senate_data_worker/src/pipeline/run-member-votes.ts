import {
  applyRollToMemberSessionStats,
  reconcileMemberSessionStats,
} from "../analytics/member-session-stats";
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
  selectConfirmationRollCalls,
  selectMemberVotesForRoll,
  selectPassageRollCalls,
  upsertMemberVotesBatch,
  type RollCallKey,
} from "../d1/member-votes";
import { refreshMemberSessionStatsForBioguides } from "../d1/member-session-stats";
import { getVoteRollMeta } from "../d1/votes";
import { ensureSchema } from "../d1/schema";
import { fetchHouseMemberVotes } from "../sources/house-member-votes";
import { fetchSenateMemberVotes } from "../sources/senate-member-votes";
import { runMembersRosterPipeline } from "./run-members-roster";
import type { MemberRecord, MemberVoteRecord } from "../types";

export interface RunMemberVotesResult {
  rollsProcessed: number;
  rollsSkipped: number;
  rollsAttempted: number;
  rollsRemaining: number;
  membersUpserted: number;
  votesUpserted: number;
  statsRepaired: boolean;
  statsFullRebuild: boolean;
  statsRollsRepaired: number;
  statsRollsRemaining: number;
}

type SenateLookup = Map<string, string>;

type IngestCounters = {
  rollsProcessed: number;
  rollsSkipped: number;
  rollsAttempted: number;
  membersUpserted: number;
  votesUpserted: number;
};

async function refreshStatsForBioguides(
  db: D1Database,
  congress: number,
  session: number,
  bioguideIds: Iterable<string>
): Promise<void> {
  const unique = [...new Set(bioguideIds)];
  if (unique.length === 0) return;
  await refreshMemberSessionStatsForBioguides(db, congress, session, unique);
}

async function fetchRollMemberVotes(
  env: Env,
  roll: RollCallKey,
  senateBioguideLookup: SenateLookup
): Promise<{ members: MemberRecord[]; votes: MemberVoteRecord[] }> {
  return roll.chamber === "House"
    ? fetchHouseMemberVotes(env, roll.congress, roll.session, roll.roll_number)
    : fetchSenateMemberVotes(env, roll.congress, roll.session, roll.roll_number, {
        senateBioguideLookup,
      });
}

function takeNewMembers(
  fetched: MemberRecord[],
  seenMembers: Set<string>
): MemberRecord[] {
  const out: MemberRecord[] = [];
  for (const member of fetched) {
    if (seenMembers.has(member.bioguideId)) continue;
    seenMembers.add(member.bioguideId);
    out.push(member);
  }
  return out;
}

/**
 * Ingest one roll's member votes. Passage rolls also update session-stats;
 * confirmation rolls write member_votes only (party splits).
 */
async function ingestRollMemberVotes(params: {
  env: Env;
  roll: RollCallKey;
  applySessionStats: boolean;
  senateBioguideLookup: SenateLookup;
  seenMembers: Set<string>;
  counters: IngestCounters;
}): Promise<"budget" | "done"> {
  const { env, roll, applySessionStats, senateBioguideLookup, seenMembers, counters } =
    params;
  const congress = roll.congress;
  const session = roll.session;

  if (counters.rollsAttempted >= MEMBER_VOTES_MAX_ROLLS_PER_RUN) return "budget";

  const existing = await countMemberVotesForRoll(env.DB, roll);
  const lisUnresolved =
    existing > 0 ? await countLisMemberVotesForRoll(env.DB, roll) : 0;
  if (existing > 0 && lisUnresolved === 0) {
    counters.rollsSkipped += 1;
    return "done";
  }

  counters.rollsAttempted += 1;
  let fetched: { members: MemberRecord[]; votes: MemberVoteRecord[] };
  try {
    fetched = await fetchRollMemberVotes(env, roll, senateBioguideLookup);
  } catch (err: unknown) {
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
    counters.rollsSkipped += 1;
    return "done";
  }

  if (fetched.votes.length === 0) {
    counters.rollsSkipped += 1;
    return "done";
  }

  let rollMeta: Awaited<ReturnType<typeof getVoteRollMeta>> | null = null;
  if (applySessionStats) {
    try {
      rollMeta = await getVoteRollMeta(env.DB, roll);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        JSON.stringify({
          event: "member_session_stats_roll_meta_failed",
          chamber: roll.chamber,
          congress: roll.congress,
          session: roll.session,
          roll_number: roll.roll_number,
          error: message,
        })
      );
      counters.rollsSkipped += 1;
      return "done";
    }
    if (!rollMeta) {
      console.error(
        JSON.stringify({
          event: "member_session_stats_missing_roll_meta",
          chamber: roll.chamber,
          congress: roll.congress,
          session: roll.session,
          roll_number: roll.roll_number,
        })
      );
      counters.rollsSkipped += 1;
      return "done";
    }
  }

  let previousBioguideIds: string[] = [];
  if (lisUnresolved > 0) {
    const previous = await selectMemberVotesForRoll(env.DB, roll);
    previousBioguideIds = previous.map((row) => row.bioguide_id);
    await deleteMemberVotesForRoll(env.DB, roll);
  }

  const newMembers = takeNewMembers(fetched.members, seenMembers);
  const fetchedBioguideIds = fetched.votes.map((vote) => vote.bioguideId);
  const parties = new Map<string, string | null>();
  for (const member of fetched.members) {
    parties.set(member.bioguideId, member.party);
  }

  try {
    await upsertMembersBatch(env.DB, newMembers, { preserveNames: true });
    await upsertMemberVotesBatch(env.DB, fetched.votes);
    if (applySessionStats && rollMeta) {
      await applyRollToMemberSessionStats(
        env.DB,
        rollMeta,
        fetched.votes.map((vote) => ({
          bioguideId: vote.bioguideId,
          position: vote.position,
        })),
        parties
      );
      const kept = new Set(fetchedBioguideIds);
      const orphans = previousBioguideIds.filter((id) => !kept.has(id));
      await refreshStatsForBioguides(env.DB, congress, session, orphans);
    }
  } catch (err: unknown) {
    await deleteMemberVotesForRoll(env.DB, roll);
    if (applySessionStats) {
      await refreshStatsForBioguides(env.DB, congress, session, [
        ...previousBioguideIds,
        ...fetchedBioguideIds,
      ]);
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({
        event: applySessionStats
          ? "member_session_stats_apply_failed"
          : "confirmation_member_votes_apply_failed",
        chamber: roll.chamber,
        congress: roll.congress,
        session: roll.session,
        roll_number: roll.roll_number,
        error: message,
      })
    );
    counters.rollsSkipped += 1;
    return "done";
  }

  counters.membersUpserted += newMembers.length;
  counters.votesUpserted += fetched.votes.length;
  counters.rollsProcessed += 1;
  return "done";
}

/**
 * Backfill per-member positions for passage + confirmation roll calls.
 * Cap: MEMBER_VOTES_MAX_ROLLS_PER_RUN fetches/run. Confirmation rolls never
 * touch session-stats; tallies join votes.is_passage = 1 so they cannot pollute.
 */
export async function runMemberVotesPipeline(env: Env): Promise<RunMemberVotesResult> {
  const congress = congressNumber(env);
  const session = sessionNumber(env);
  await ensureSchema(env.DB);

  if (!(await hasRealMemberRoster(env.DB)) && env.CONGRESS_API_KEY?.trim()) {
    await runMembersRosterPipeline(env);
  }

  const senateBioguideLookup = await buildSenateBioguideLookup(env.DB);
  const queues: Array<{ rolls: RollCallKey[]; applySessionStats: boolean }> = [
    {
      rolls: await selectPassageRollCalls(env.DB, congress, session),
      applySessionStats: true,
    },
    {
      rolls: await selectConfirmationRollCalls(env.DB, congress, session),
      applySessionStats: false,
    },
  ];

  const counters: IngestCounters = {
    rollsProcessed: 0,
    rollsSkipped: 0,
    rollsAttempted: 0,
    membersUpserted: 0,
    votesUpserted: 0,
  };
  const seenMembers = new Set<string>();
  let rollsRemaining = 0;

  for (const queue of queues) {
    let index = 0;
    for (; index < queue.rolls.length; index += 1) {
      const status = await ingestRollMemberVotes({
        env,
        roll: queue.rolls[index]!,
        applySessionStats: queue.applySessionStats,
        senateBioguideLookup,
        seenMembers,
        counters,
      });
      if (status === "budget") break;
    }
    rollsRemaining += Math.max(0, queue.rolls.length - index);
  }

  const statsReconcile = await reconcileMemberSessionStats(env.DB, congress, session);

  return {
    ...counters,
    rollsRemaining,
    statsRepaired: statsReconcile.repaired,
    statsFullRebuild: statsReconcile.fullRebuild,
    statsRollsRepaired: statsReconcile.rollsRepaired,
    statsRollsRemaining: statsReconcile.rollsRemaining,
  };
}
