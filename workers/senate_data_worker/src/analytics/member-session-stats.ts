import type { VoteRollMeta } from "../d1/votes";
import { getMembersByIds } from "../d1/members";
import { selectMemberVotesForSession } from "../d1/member-votes";
import {
  clearMemberSessionStatsForSession,
  countMemberVotesInSession,
  refreshMemberSessionStatsForBioguides,
  replaceMemberCrossVotesForRoll,
  sumMemberSessionVotesCast,
  type MemberCrossVoteRow,
} from "../d1/member-session-stats";
import { rollCrossVotes } from "./cross-votes";

export type RollVotePosition = {
  bioguideId: string;
  position: string;
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

/** Rebuild when member_votes and member_session_stats disagree. */
export async function reconcileMemberSessionStats(
  db: D1Database,
  congress: number,
  session: number
): Promise<boolean> {
  if (!(await memberSessionStatsOutOfSync(db, congress, session))) {
    return false;
  }
  await rebuildMemberSessionStats(db, congress, session);
  return true;
}
