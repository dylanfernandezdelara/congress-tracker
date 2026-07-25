import type { Chamber, DefectorEntry, VoteDefectorEntry } from "../types";
import {
  isLisMemberId,
  isLocalSampleMemberId,
  isRealBioguideId,
} from "../../../../shared/member-id";
import { congressGovMemberUrl } from "../../../../shared/member-photo";
import { getMembersByIds, hasRealMemberRoster } from "../d1/members";
import { selectMemberVotesForRoll, type RollCallKey } from "../d1/member-votes";
import { selectMemberCrossVotesForChamber } from "../d1/member-session-stats";
import type { RollPartySplit } from "../../../../shared/stats-api-types";
import { rollCrossVotes } from "./cross-votes";
import { rollPartySplits } from "./roll-party-stats";

/** Real bioguide → congress.gov; unresolved LIS → Senate directory; else null. */
function defectorCongressGovUrl(bioguideId: string, name: string): string | null {
  const memberUrl = congressGovMemberUrl(bioguideId, name);
  if (memberUrl) return memberUrl;
  if (isLisMemberId(bioguideId)) {
    return "https://www.senate.gov/general/contact_information/senators_cfm.cfm";
  }
  return null;
}

/**
 * Rank party-line breakers from denormalized `member_cross_votes` (maintained by
 * the member-votes ingest pipeline) instead of scanning all session member_votes.
 */
export async function computeDefectors(
  db: D1Database,
  congress: number,
  session: number,
  chamber: Chamber,
  limit: number
): Promise<DefectorEntry[]> {
  const rows = await selectMemberCrossVotesForChamber(db, congress, session, chamber);
  if (rows.length === 0) return [];

  const excludeLocalSample = await hasRealMemberRoster(db);
  const uniqueIds = [
    ...new Set(
      rows
        .map((row) => row.bioguide_id)
        .filter((id) => !excludeLocalSample || isRealBioguideId(id))
    ),
  ];
  if (uniqueIds.length === 0) return [];

  const memberRows = await getMembersByIds(db, uniqueIds);
  const scores = new Map<
    string,
    { crossVotes: number; decidingScore: number; recent?: DefectorEntry["recent_example"] }
  >();

  for (const row of rows) {
    if (excludeLocalSample && !isRealBioguideId(row.bioguide_id)) continue;

    const weight = 1 / Math.max(1, row.margin);
    const current = scores.get(row.bioguide_id) ?? { crossVotes: 0, decidingScore: 0 };
    current.crossVotes += 1;
    current.decidingScore += weight;
    // Rows arrive newest-first, so the first cross vote is the most recent.
    if (!current.recent) {
      current.recent = {
        bill_type: row.bill_type,
        bill_number: row.bill_number,
        congress: row.bill_congress,
        margin: row.margin,
      };
    }
    scores.set(row.bioguide_id, current);
  }

  const defectors: DefectorEntry[] = [];
  for (const [bioguideId, score] of scores) {
    const member = memberRows.get(bioguideId);
    const name = member?.name ?? bioguideId;
    const party = member?.party ?? "?";
    const state = member?.state ?? "?";
    defectors.push({
      bioguide_id: bioguideId,
      name,
      party,
      state,
      cross_vote_count: score.crossVotes,
      deciding_score: score.decidingScore,
      congress_gov_url: defectorCongressGovUrl(bioguideId, name),
      recent_example: score.recent,
    });
  }

  return defectors
    .sort((a, b) => b.deciding_score - a.deciding_score || b.cross_vote_count - a.cross_vote_count)
    .slice(0, limit);
}

export type RollDefectorsResult = {
  defectors: VoteDefectorEntry[];
  party_splits: RollPartySplit[];
  member_votes_available: boolean;
};

export async function computeRollDefectors(
  db: D1Database,
  roll: RollCallKey
): Promise<RollDefectorsResult> {
  const rows = await selectMemberVotesForRoll(db, roll);
  if (rows.length === 0) {
    return { defectors: [], party_splits: [], member_votes_available: false };
  }

  const excludeLocalSample = await hasRealMemberRoster(db);
  // Only seeded rows are dropped. Senators still carried under an unresolved
  // LIS id cast real votes, and discarding them would leave the party splits
  // short of the chamber totals shown next to them.
  const filteredRows = excludeLocalSample
    ? rows.filter((row) => !isLocalSampleMemberId(row.bioguide_id))
    : rows;
  if (filteredRows.length === 0) {
    return { defectors: [], party_splits: [], member_votes_available: false };
  }

  const uniqueIds = [...new Set(filteredRows.map((row) => row.bioguide_id))];
  const memberRows = await getMembersByIds(db, uniqueIds);
  const members = new Map<string, { party: string | null; state: string | null; name: string }>();
  for (const [bioguideId, record] of memberRows) {
    members.set(bioguideId, {
      party: record.party,
      state: record.state,
      name: record.name,
    });
  }
  for (const bioguideId of uniqueIds) {
    if (!members.has(bioguideId)) {
      members.set(bioguideId, { party: null, state: null, name: bioguideId });
    }
  }

  const positions = filteredRows.map((row) => ({
    bioguideId: row.bioguide_id,
    party: members.get(row.bioguide_id)?.party ?? null,
    position: row.position,
  }));
  const crosses = rollCrossVotes(positions);
  const party_splits = rollPartySplits(positions);

  const defectors: VoteDefectorEntry[] = [];
  for (const cross of crosses) {
    const member = members.get(cross.bioguideId);
    if (!member?.party) continue;
    defectors.push({
      bioguide_id: cross.bioguideId,
      name: member.name,
      party: member.party,
      state: member.state ?? "?",
      position: cross.position,
      party_line: cross.partyLine,
      congress_gov_url: defectorCongressGovUrl(cross.bioguideId, member.name),
    });
  }

  return {
    defectors: defectors.sort((a, b) => a.name.localeCompare(b.name)),
    party_splits,
    member_votes_available: true,
  };
}
