import { bioguidePhotoUrl, congressGovMemberUrl } from "../../../../shared/member-photo";
import { crossVoteLabel } from "../../../../shared/notable-votes";
import { normalizePartyCode } from "../../../../shared/party";
import type { MemberProfileRecentCrossVote, MemberProfileResponse } from "../../../../shared/stats-api-types";
import { normalizeVotePosition } from "../../../../shared/vote-positions";
import { getMember, getMembersByIds } from "../d1/members";
import { selectMemberVotesForSession, type MemberVoteWithRoll } from "../d1/member-votes";
import { partyMajoritiesForRoll } from "./roll-party-stats";

const RECENT_CROSS_VOTE_LIMIT = 5;

function normalizePosition(position: string): "yea" | "nay" | "other" {
  return normalizeVotePosition(position);
}

/**
 * Build a member profile for the current session: roster identity plus
 * passage-vote tallies and recent party-line breaks.
 */
export async function buildMemberProfile(
  db: D1Database,
  congress: number,
  session: number,
  bioguideId: string
): Promise<MemberProfileResponse | null> {
  const member = await getMember(db, bioguideId);
  if (!member) return null;

  const rows = await selectMemberVotesForSession(db, congress, session, member.chamber);
  const memberVotes = rows.filter((row) => row.bioguide_id === bioguideId);

  let yea_count = 0;
  let nay_count = 0;
  for (const row of memberVotes) {
    const side = normalizePosition(row.position);
    if (side === "yea") yea_count += 1;
    else if (side === "nay") nay_count += 1;
  }

  const { cross_vote_count, recent_cross_votes } = await computeMemberCrossVotes(
    db,
    rows,
    bioguideId,
    member.party
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
  rows: MemberVoteWithRoll[],
  bioguideId: string,
  memberParty: string | null
): Promise<{
  cross_vote_count: number;
  recent_cross_votes: MemberProfileRecentCrossVote[];
}> {
  if (!memberParty || rows.length === 0) {
    return { cross_vote_count: 0, recent_cross_votes: [] };
  }

  const uniqueIds = [...new Set(rows.map((row) => row.bioguide_id))];
  const memberRows = await getMembersByIds(db, uniqueIds);
  const parties = new Map<string, string | null>();
  for (const [id, record] of memberRows) {
    parties.set(id, record.party);
  }

  const byRoll = new Map<string, MemberVoteWithRoll[]>();
  for (const row of rows) {
    const key = `${row.chamber}:${row.congress}:${row.session}:${row.roll_number}`;
    const list = byRoll.get(key) ?? [];
    list.push(row);
    byRoll.set(key, list);
  }

  const partyKey = normalizePartyCode(memberParty);
  let cross_vote_count = 0;
  const recent_cross_votes: MemberProfileRecentCrossVote[] = [];

  // rows arrive newest-first; Map insertion preserves that order.
  for (const rollRows of byRoll.values()) {
    const target = rollRows.find((row) => row.bioguide_id === bioguideId);
    if (!target) continue;

    const partyMajorities = partyMajoritiesForRoll(
      rollRows.map((row) => ({
        party: parties.get(row.bioguide_id) ?? null,
        position: row.position,
      }))
    );
    const partyLine = partyMajorities.get(partyKey) ?? null;
    const memberSide = normalizePosition(target.position);
    if (partyLine === null || memberSide === "other" || memberSide === partyLine) continue;

    cross_vote_count += 1;
    if (recent_cross_votes.length < RECENT_CROSS_VOTE_LIMIT) {
      recent_cross_votes.push({
        chamber: target.chamber as MemberProfileRecentCrossVote["chamber"],
        congress: target.congress,
        session: target.session,
        roll_number: target.roll_number,
        bill_type: target.bill_type,
        bill_number: target.bill_number,
        bill_congress: target.bill_congress,
        vote_date: target.vote_date,
        position: memberSide,
        party_line: partyLine,
        margin: Math.abs(target.yeas - target.nays),
      });
    }
  }

  return { cross_vote_count, recent_cross_votes };
}
