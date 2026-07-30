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
  /** Successful roll ingest writes this run. */
  rollsProcessed: number;
  /** Rolls skipped (already complete, empty upstream, or fetch error). */
  rollsSkipped: number;
  /** Upstream fetches attempted this run (success, empty, or error). */
  rollsAttempted: number;
  rollsRemaining: number;
  membersUpserted: number;
  votesUpserted: number;
  /** Session-stats reconcile wrote repairs this run. */
  statsRepaired: boolean;
  /** Empty denormalized tables triggered a full clear+rebuild. */
  statsFullRebuild: boolean;
  /** Drifted rolls repaired this reconcile pass. */
  statsRollsRepaired: number;
  /** Drifted rolls still outstanding after bounded reconcile. */
  statsRollsRemaining: number;
}

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

type FetchLookup = Map<string, string>;

async function fetchRollMemberVotes(
  env: Env,
  roll: RollCallKey,
  senateBioguideLookup: FetchLookup
): Promise<{ members: MemberRecord[]; votes: MemberVoteRecord[] }> {
  return roll.chamber === "House"
    ? fetchHouseMemberVotes(env, roll.congress, roll.session, roll.roll_number)
    : fetchSenateMemberVotes(env, roll.congress, roll.session, roll.roll_number, {
        senateBioguideLookup,
      });
}

function collectNewMembers(
  fetched: MemberRecord[],
  seenMembers: Set<string>
): MemberRecord[] {
  const newMembers: MemberRecord[] = [];
  for (const member of fetched) {
    if (seenMembers.has(member.bioguideId)) continue;
    seenMembers.add(member.bioguideId);
    newMembers.push(member);
  }
  return newMembers;
}

/**
 * Backfill per-member positions for passage + confirmation roll calls. Writes
 * are batched (one atomic D1 batch per roll) and capped at
 * MEMBER_VOTES_MAX_ROLLS_PER_RUN upstream fetches per invocation to stay under
 * the Worker subrequest limit. Re-invoke until `rollsRemaining` is 0.
 *
 * Passage rolls also update session-stats / cross-vote tallies. Confirmation
 * rolls store member_votes only (for party-split display) — they are not
 * bill passage votes and must not touch member_session_stats. Session-stats
 * tallies join `votes.is_passage = 1` so confirmation rows cannot pollute them.
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
  const passageRolls = await selectPassageRollCalls(env.DB, congress, session);
  const confirmationRolls = await selectConfirmationRollCalls(env.DB, congress, session);

  let rollsProcessed = 0;
  let rollsSkipped = 0;
  let rollsAttempted = 0;
  let membersUpserted = 0;
  let votesUpserted = 0;
  // Dedupe member upserts across rolls — the same member appears on every roll.
  const seenMembers = new Set<string>();

  let passageIndex = 0;
  for (; passageIndex < passageRolls.length; passageIndex += 1) {
    if (rollsAttempted >= MEMBER_VOTES_MAX_ROLLS_PER_RUN) break;
    const roll = passageRolls[passageIndex]!;

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
      fetched = await fetchRollMemberVotes(env, roll, senateBioguideLookup);
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

    // Resolve bill metadata before any member_votes write so a missing/failed
    // lookup cannot leave an "already ingested" roll without session stats.
    let rollMeta: Awaited<ReturnType<typeof getVoteRollMeta>>;
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
      rollsSkipped += 1;
      continue;
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
      rollsSkipped += 1;
      continue;
    }

    // Capture prior voters before a LIS rewrite so their tallies can be
    // refreshed (including orphans who disappear after bioguide resolution).
    let previousBioguideIds: string[] = [];
    if (lisUnresolved > 0) {
      const previous = await selectMemberVotesForRoll(env.DB, roll);
      previousBioguideIds = previous.map((row) => row.bioguide_id);
      await deleteMemberVotesForRoll(env.DB, roll);
    }

    const newMembers = collectNewMembers(fetched.members, seenMembers);
    const fetchedBioguideIds = fetched.votes.map((vote) => vote.bioguideId);
    const parties = new Map<string, string | null>();
    for (const member of fetched.members) {
      parties.set(member.bioguideId, member.party);
    }

    try {
      // Members first so a votes-batch failure leaves the roll empty (existing=0)
      // and it is safely retried on the next run.
      await upsertMembersBatch(env.DB, newMembers, { preserveNames: true });
      await upsertMemberVotesBatch(env.DB, fetched.votes);
      await applyRollToMemberSessionStats(
        env.DB,
        rollMeta,
        fetched.votes.map((vote) => ({
          bioguideId: vote.bioguideId,
          position: vote.position,
        })),
        parties
      );
      // Drop inflated tallies for bioguides removed by an LIS → bioguide rewrite.
      const kept = new Set(fetchedBioguideIds);
      const orphans = previousBioguideIds.filter((id) => !kept.has(id));
      await refreshStatsForBioguides(env.DB, congress, session, orphans);
    } catch (err: unknown) {
      // Any failure after the LIS delete / vote write must leave the roll empty
      // so the next run retries ingest + stats (skip check uses existing>0).
      await deleteMemberVotesForRoll(env.DB, roll);
      await refreshStatsForBioguides(env.DB, congress, session, [
        ...previousBioguideIds,
        ...fetchedBioguideIds,
      ]);
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        JSON.stringify({
          event: "member_session_stats_apply_failed",
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

    membersUpserted += newMembers.length;
    votesUpserted += fetched.votes.length;
    rollsProcessed += 1;
  }

  // Confirmation rolls: member_votes only (party splits). No session-stats path.
  let confirmationIndex = 0;
  for (; confirmationIndex < confirmationRolls.length; confirmationIndex += 1) {
    if (rollsAttempted >= MEMBER_VOTES_MAX_ROLLS_PER_RUN) break;
    const roll = confirmationRolls[confirmationIndex]!;

    const existing = await countMemberVotesForRoll(env.DB, roll);
    const lisUnresolved =
      existing > 0 ? await countLisMemberVotesForRoll(env.DB, roll) : 0;
    if (existing > 0 && lisUnresolved === 0) {
      rollsSkipped += 1;
      continue;
    }

    rollsAttempted += 1;
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

    const newMembers = collectNewMembers(fetched.members, seenMembers);

    try {
      await upsertMembersBatch(env.DB, newMembers, { preserveNames: true });
      await upsertMemberVotesBatch(env.DB, fetched.votes);
    } catch (err: unknown) {
      await deleteMemberVotesForRoll(env.DB, roll);
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        JSON.stringify({
          event: "confirmation_member_votes_apply_failed",
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

    membersUpserted += newMembers.length;
    votesUpserted += fetched.votes.length;
    rollsProcessed += 1;
  }

  // Repair / backfill after ingest so a heavy rebuild cannot block new rolls.
  // Incremental + bounded; empty denormalized tables still full-rebuild once.
  const statsReconcile = await reconcileMemberSessionStats(env.DB, congress, session);

  const rollsRemaining =
    Math.max(0, passageRolls.length - passageIndex) +
    Math.max(0, confirmationRolls.length - confirmationIndex);

  return {
    rollsProcessed,
    rollsSkipped,
    rollsAttempted,
    rollsRemaining,
    membersUpserted,
    votesUpserted,
    statsRepaired: statsReconcile.repaired,
    statsFullRebuild: statsReconcile.fullRebuild,
    statsRollsRepaired: statsReconcile.rollsRepaired,
    statsRollsRemaining: statsReconcile.rollsRemaining,
  };
}
