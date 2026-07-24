import { MEMBER_SESSION_STATS_MAX_ROLLS_PER_RECONCILE } from "../constants";
import type { VoteRollMeta } from "../d1/votes";
import { getVoteRollMeta } from "../d1/votes";
import { getMembersByIds } from "../d1/members";
import {
  selectMemberVotesForRoll,
  selectMemberVotesForSession,
} from "../d1/member-votes";
import {
  clearMemberSessionStatsForSession,
  countMemberCrossVotesInSession,
  countMemberSessionStatsRows,
  countMemberVotesInSession,
  deleteMemberCrossVotesForRoll,
  refreshMemberSessionStatsForBioguides,
  replaceMemberCrossVotesForRoll,
  selectDriftedSessionRolls,
  selectMemberCrossVoteBioguidesForRoll,
  selectOrphanSessionStatsBioguides,
  sumMemberSessionVotesCast,
  type MemberCrossVoteRow,
  type SessionRollKey,
} from "../d1/member-session-stats";
import { rollCrossVotes } from "./cross-votes";

export type RollVotePosition = {
  bioguideId: string;
  position: string;
};

export type ReconcileMemberSessionStatsResult = {
  /** True when any repair work ran (writes occurred). */
  repaired: boolean;
  /** True when the empty-table full clear+rebuild path ran. */
  fullRebuild: boolean;
  rollsRepaired: number;
  /** Drifted rolls still outstanding after this bounded pass. */
  rollsRemaining: number;
};

/**
 * True when member_votes exist for the session but denormalized stats do not
 * match (missing after deploy, or left stale by a failed apply).
 */
export async function memberSessionStatsOutOfSync(
  db: D1Database,
  congress: number,
  session: number
): Promise<boolean> {
  const voteCount = await countMemberVotesInSession(db, congress, session);
  if (voteCount === 0) return false;
  const statsSum = await sumMemberSessionVotesCast(db, congress, session);
  return statsSum !== voteCount;
}

async function denormalizedStatsEmpty(
  db: D1Database,
  congress: number,
  session: number
): Promise<boolean> {
  const [statsRows, crossRows] = await Promise.all([
    countMemberSessionStatsRows(db, congress, session),
    countMemberCrossVotesInSession(db, congress, session),
  ]);
  return statsRows === 0 && crossRows === 0;
}

function crossVoteRowsForRoll(
  rollMeta: VoteRollMeta,
  votes: RollVotePosition[],
  parties: Map<string, string | null>
): MemberCrossVoteRow[] {
  const crosses = rollCrossVotes(
    votes.map((vote) => ({
      bioguideId: vote.bioguideId,
      party: parties.get(vote.bioguideId) ?? null,
      position: vote.position,
    }))
  );
  const margin = Math.abs(rollMeta.yeas - rollMeta.nays);
  return crosses.map((cross) => ({
    chamber: rollMeta.chamber,
    congress: rollMeta.congress,
    session: rollMeta.session,
    roll_number: rollMeta.roll_number,
    bioguide_id: cross.bioguideId,
    bill_type: rollMeta.bill_type,
    bill_number: rollMeta.bill_number,
    bill_congress: rollMeta.bill_congress,
    vote_date: rollMeta.vote_date,
    position: cross.position,
    party_line: cross.partyLine,
    margin,
  }));
}

/**
 * Apply one ingested roll to member_session_stats / member_cross_votes.
 * Safe to call after a rewrite: replaces that roll's cross-vote rows, then
 * recomputes tallies for every member on the roll from member_votes.
 */
export async function applyRollToMemberSessionStats(
  db: D1Database,
  rollMeta: VoteRollMeta,
  votes: RollVotePosition[],
  parties: Map<string, string | null>
): Promise<void> {
  if (votes.length === 0) return;

  await replaceMemberCrossVotesForRoll(
    db,
    {
      chamber: rollMeta.chamber,
      congress: rollMeta.congress,
      session: rollMeta.session,
      roll_number: rollMeta.roll_number,
    },
    crossVoteRowsForRoll(rollMeta, votes, parties)
  );

  await refreshMemberSessionStatsForBioguides(
    db,
    rollMeta.congress,
    rollMeta.session,
    votes.map((vote) => vote.bioguideId)
  );
}

/**
 * Rebuild session stats from stored member_votes. Used on deploy/migration
 * when rolls were ingested before stats existed, or when the invariant drifts.
 */
export async function rebuildMemberSessionStats(
  db: D1Database,
  congress: number,
  session: number
): Promise<void> {
  await clearMemberSessionStatsForSession(db, congress, session);

  const allBioguideIds = new Set<string>();

  for (const chamber of ["House", "Senate"] as const) {
    const rows = await selectMemberVotesForSession(db, congress, session, chamber);
    if (rows.length === 0) continue;

    const byRoll = new Map<number, typeof rows>();
    for (const row of rows) {
      const list = byRoll.get(row.roll_number) ?? [];
      list.push(row);
      byRoll.set(row.roll_number, list);
      allBioguideIds.add(row.bioguide_id);
    }

    const uniqueIds = [...new Set(rows.map((row) => row.bioguide_id))];
    const roster = await getMembersByIds(db, uniqueIds);
    const parties = new Map<string, string | null>();
    for (const [id, record] of roster) {
      parties.set(id, record.party);
    }

    for (const [rollNumber, rollRows] of byRoll) {
      const sample = rollRows[0]!;
      const rollMeta: VoteRollMeta = {
        chamber: sample.chamber,
        congress: sample.congress,
        session: sample.session,
        roll_number: rollNumber,
        bill_type: sample.bill_type,
        bill_number: sample.bill_number,
        bill_congress: sample.bill_congress,
        yeas: sample.yeas,
        nays: sample.nays,
        vote_date: sample.vote_date,
      };

      await replaceMemberCrossVotesForRoll(
        db,
        {
          chamber: rollMeta.chamber,
          congress: rollMeta.congress,
          session: rollMeta.session,
          roll_number: rollMeta.roll_number,
        },
        crossVoteRowsForRoll(
          rollMeta,
          rollRows.map((row) => ({
            bioguideId: row.bioguide_id,
            position: row.position,
          })),
          parties
        )
      );
    }
  }

  await refreshMemberSessionStatsForBioguides(
    db,
    congress,
    session,
    [...allBioguideIds]
  );
}

async function repairSessionRoll(
  db: D1Database,
  congress: number,
  session: number,
  roll: SessionRollKey
): Promise<void> {
  const rollKey = {
    chamber: roll.chamber,
    congress,
    session,
    roll_number: roll.roll_number,
  };
  const votes = await selectMemberVotesForRoll(db, rollKey);
  if (votes.length === 0) {
    // Orphan cross-vote rows for a roll with no member_votes: delete them, then
    // refresh affected tallies so cross_vote_count cannot stay inflated.
    const affected = await selectMemberCrossVoteBioguidesForRoll(db, rollKey);
    await deleteMemberCrossVotesForRoll(db, rollKey);
    if (affected.length > 0) {
      await refreshMemberSessionStatsForBioguides(db, congress, session, affected);
    }
    return;
  }

  const rollMeta = await getVoteRollMeta(db, rollKey);
  if (!rollMeta) {
    // Cannot rebuild cross-votes without passage roll tallies. Drop stale cross
    // rows for this roll and still refresh votes_cast so drift cannot stick
    // across bounded reconcile passes.
    await deleteMemberCrossVotesForRoll(db, rollKey);
    await refreshMemberSessionStatsForBioguides(
      db,
      congress,
      session,
      votes.map((vote) => vote.bioguide_id)
    );
    return;
  }

  const roster = await getMembersByIds(
    db,
    votes.map((vote) => vote.bioguide_id)
  );
  const parties = new Map<string, string | null>();
  for (const [id, record] of roster) {
    parties.set(id, record.party);
  }

  await applyRollToMemberSessionStats(
    db,
    rollMeta,
    votes.map((vote) => ({
      bioguideId: vote.bioguide_id,
      position: vote.position,
    })),
    parties
  );
}

/**
 * Repair drifted member_session_stats / member_cross_votes incrementally.
 * - Empty denormalized tables → full clear+rebuild escape hatch.
 * - Otherwise repair at most MEMBER_SESSION_STATS_MAX_ROLLS_PER_RECONCILE rolls
 *   and report how many remain for the next run.
 * - No-drift is a no-op (constant-time count queries, no writes).
 */
export async function reconcileMemberSessionStats(
  db: D1Database,
  congress: number,
  session: number,
  maxRolls: number = MEMBER_SESSION_STATS_MAX_ROLLS_PER_RECONCILE
): Promise<ReconcileMemberSessionStatsResult> {
  const noop: ReconcileMemberSessionStatsResult = {
    repaired: false,
    fullRebuild: false,
    rollsRepaired: 0,
    rollsRemaining: 0,
  };

  if (!(await memberSessionStatsOutOfSync(db, congress, session))) {
    return noop;
  }

  if (await denormalizedStatsEmpty(db, congress, session)) {
    await rebuildMemberSessionStats(db, congress, session);
    return {
      repaired: true,
      fullRebuild: true,
      rollsRepaired: 0,
      rollsRemaining: 0,
    };
  }

  const driftedRolls = await selectDriftedSessionRolls(db, congress, session);
  const batch = driftedRolls.slice(0, Math.max(0, maxRolls));
  for (const roll of batch) {
    await repairSessionRoll(db, congress, session, roll);
  }

  const orphans = await selectOrphanSessionStatsBioguides(db, congress, session);
  if (orphans.length > 0) {
    await refreshMemberSessionStatsForBioguides(db, congress, session, orphans);
  }

  const rollsRemaining = Math.max(0, driftedRolls.length - batch.length);
  return {
    repaired: batch.length > 0 || orphans.length > 0,
    fullRebuild: false,
    rollsRepaired: batch.length,
    rollsRemaining,
  };
}
