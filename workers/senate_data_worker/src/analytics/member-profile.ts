import { bioguidePhotoUrl, congressGovMemberUrl } from "../../../../shared/member-photo";
import { crossVoteLabel } from "../../../../shared/notable-votes";
import type { MemberProfileRecentCrossVote, MemberProfileResponse } from "../../../../shared/stats-api-types";
import { normalizeVotePosition } from "../../../../shared/vote-positions";
import { getMember, getMembersByIds } from "../d1/members";
import {
  selectMemberVotesForBioguide,
  selectMemberVotesForRollNumbers,
  type MemberVoteWithRoll,
} from "../d1/member-votes";
import {
  getMemberSessionStats,
  selectRecentMemberCrossVotes,
} from "../d1/member-session-stats";
import { rollCrossVotes } from "./cross-votes";

const RECENT_CROSS_VOTE_LIMIT = 5;

/**
 * Build a member profile for the current session: roster identity plus
 * passage-vote tallies and recent party-line breaks.
 *
 * Prefers denormalized member_session_stats (maintained when member votes are
 * ingested). Falls back to a live scan when stats have not been backfilled yet.
 */
export async function buildMemberProfile(
  db: D1Database,
  congress: number,
  session: number,
  bioguideId: string
): Promise<MemberProfileResponse | null> {
  const member = await getMember(db, bioguideId);
  if (!member) return null;

  const stats = await getMemberSessionStats(db, congress, session, bioguideId);
  if (stats) {
    const recent_cross_votes = await selectRecentMemberCrossVotes(
      db,
      congress,
      session,
      bioguideId,
      RECENT_CROSS_VOTE_LIMIT
    );
    return {
      bioguide_id: member.bioguideId,
      name: member.name,
      chamber: member.chamber,
      party: member.party ?? "?",
      state: member.state ?? "?",
      district: member.district,
      photo_url: bioguidePhotoUrl(member.bioguideId) ?? "",
      congress_gov_url: congressGovMemberUrl(member.bioguideId),
      congress,
      session,
      votes_cast: stats.votes_cast,
      yea_count: stats.yea_count,
      nay_count: stats.nay_count,
      cross_vote_count: stats.cross_vote_count,
      cross_vote_label: crossVoteLabel(stats.cross_vote_count),
      recent_cross_votes,
      member_votes_available: stats.votes_cast > 0,
      as_of: stats.updated_at,
    };
  }

  return buildMemberProfileLive(db, congress, session, member);
}

async function buildMemberProfileLive(
  db: D1Database,
  congress: number,
  session: number,
  member: {
    bioguideId: string;
    name: string;
    chamber: "House" | "Senate";
    party: string | null;
    state: string | null;
    district: number | null;
  }
): Promise<MemberProfileResponse> {
  const memberVotes = await selectMemberVotesForBioguide(db, congress, session, member.bioguideId);

  let yea_count = 0;
  let nay_count = 0;
  for (const row of memberVotes) {
    const side = normalizeVotePosition(row.position);
    if (side === "yea") yea_count += 1;
    else if (side === "nay") nay_count += 1;
  }

  const { cross_vote_count, recent_cross_votes } = await computeMemberCrossVotes(
    db,
    member,
    memberVotes
  );

  return {
    bioguide_id: member.bioguideId,
    name: member.name,
    chamber: member.chamber,
    party: member.party ?? "?",
    state: member.state ?? "?",
    district: member.district,
    photo_url: bioguidePhotoUrl(member.bioguideId) ?? "",
    congress_gov_url: congressGovMemberUrl(member.bioguideId),
    congress,
    session,
    votes_cast: memberVotes.length,
    yea_count,
    nay_count,
    cross_vote_count,
    cross_vote_label: crossVoteLabel(cross_vote_count),
    recent_cross_votes,
    member_votes_available: memberVotes.length > 0,
    as_of: new Date().toISOString(),
  };
}

async function computeMemberCrossVotes(
  db: D1Database,
  member: { bioguideId: string; chamber: string; party: string | null },
  memberVotes: MemberVoteWithRoll[]
): Promise<{
  cross_vote_count: number;
  recent_cross_votes: MemberProfileRecentCrossVote[];
}> {
  if (!member.party || memberVotes.length === 0) {
    return { cross_vote_count: 0, recent_cross_votes: [] };
  }

  const rollNumbers = [...new Set(memberVotes.map((row) => row.roll_number))];
  const peerRows = await selectMemberVotesForRollNumbers(
    db,
    member.chamber,
    memberVotes[0]!.congress,
    memberVotes[0]!.session,
    rollNumbers
  );

  const uniqueIds = [...new Set(peerRows.map((row) => row.bioguide_id))];
  const roster = await getMembersByIds(db, uniqueIds);
  const parties = new Map<string, string | null>();
  for (const [id, record] of roster) {
    parties.set(id, record.party);
  }

  const peersByRoll = new Map<number, typeof peerRows>();
  for (const row of peerRows) {
    const list = peersByRoll.get(row.roll_number) ?? [];
    list.push(row);
    peersByRoll.set(row.roll_number, list);
  }

  const memberVoteByRoll = new Map(memberVotes.map((row) => [row.roll_number, row]));
  let cross_vote_count = 0;
  const recent_cross_votes: MemberProfileRecentCrossVote[] = [];

  // memberVotes arrive newest-first; walk in that order for recent examples.
  for (const vote of memberVotes) {
    const peers = peersByRoll.get(vote.roll_number) ?? [];
    const crosses = rollCrossVotes(
      peers.map((row) => ({
        bioguideId: row.bioguide_id,
        party: parties.get(row.bioguide_id) ?? null,
        position: row.position,
      }))
    );
    const mine = crosses.find((cross) => cross.bioguideId === member.bioguideId);
    if (!mine) continue;

    cross_vote_count += 1;
    if (recent_cross_votes.length < RECENT_CROSS_VOTE_LIMIT) {
      const source = memberVoteByRoll.get(vote.roll_number) ?? vote;
      recent_cross_votes.push({
        chamber: source.chamber as MemberProfileRecentCrossVote["chamber"],
        congress: source.congress,
        session: source.session,
        roll_number: source.roll_number,
        bill_type: source.bill_type,
        bill_number: source.bill_number,
        bill_congress: source.bill_congress,
        vote_date: source.vote_date,
        position: mine.position,
        party_line: mine.partyLine,
        margin: Math.abs(source.yeas - source.nays),
      });
    }
  }

  return { cross_vote_count, recent_cross_votes };
}
