import type { Chamber, DefectorEntry, VoteDefectorEntry } from "../types";
import { isRealBioguideId } from "../../../../shared/member-id";
import { normalizePartyCode } from "../../../../shared/party";
import { getMembersByIds, hasRealMemberRoster } from "../d1/members";
import { selectMemberVotesForRoll, type RollCallKey, selectMemberVotesForSession } from "../d1/member-votes";
import { normalizeVotePosition } from "../../../../shared/vote-positions";
import { partyMajoritiesForRoll } from "./roll-party-stats";

function normalizePosition(position: string): "yea" | "nay" | "other" {
  return normalizeVotePosition(position);
}

function congressGovMemberUrl(bioguideId: string): string {
  if (bioguideId.startsWith("LIS:")) {
    return "https://www.senate.gov/general/contact_information/senators_cfm.cfm";
  }
  return `https://www.congress.gov/member/${bioguideId.toLowerCase()}`;
}

export async function computeDefectors(
  db: D1Database,
  congress: number,
  session: number,
  chamber: Chamber,
  limit: number
): Promise<DefectorEntry[]> {
  const rows = await selectMemberVotesForSession(db, congress, session, chamber);
  if (rows.length === 0) return [];

  const excludeLocalSample = await hasRealMemberRoster(db);
  const uniqueIds = [
    ...new Set(
      rows
        .map((row) => row.bioguide_id)
        .filter((id) => !excludeLocalSample || isRealBioguideId(id))
    ),
  ];
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

  const byRoll = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.chamber}:${row.roll_number}`;
    const list = byRoll.get(key) ?? [];
    list.push(row);
    byRoll.set(key, list);
  }

  const scores = new Map<
    string,
    { crossVotes: number; decidingScore: number; recent?: DefectorEntry["recent_example"] }
  >();

  for (const rollRows of byRoll.values()) {
    const margin = Math.abs(rollRows[0].yeas - rollRows[0].nays);
    const weight = 1 / Math.max(1, margin);
    const partyMajorities = partyMajoritiesForRoll(
      rollRows.map((r) => ({
        party: members.get(r.bioguide_id)?.party ?? null,
        position: r.position,
      }))
    );

    for (const row of rollRows) {
      if (excludeLocalSample && !isRealBioguideId(row.bioguide_id)) continue;
      const member = members.get(row.bioguide_id);
      if (!member?.party) continue;
      const partyKey = normalizePartyCode(member.party);
      const partySide = partyMajorities.get(partyKey) ?? null;
      const memberSide = normalizePosition(row.position);
      if (partySide === null || memberSide === "other" || memberSide === partySide) continue;

      const current = scores.get(row.bioguide_id) ?? { crossVotes: 0, decidingScore: 0 };
      current.crossVotes += 1;
      current.decidingScore += weight;
      // Rows arrive newest-first (ORDER BY vote_date DESC), so the first cross
      // vote we see for a member is their most recent — keep that one.
      if (!current.recent) {
        current.recent = {
          bill_type: row.bill_type,
          bill_number: row.bill_number,
          congress: row.bill_congress,
          margin,
        };
      }
      scores.set(row.bioguide_id, current);
    }
  }

  const defectors: DefectorEntry[] = [];
  for (const [bioguideId, score] of scores) {
    const member = members.get(bioguideId);
    if (!member) continue;
    defectors.push({
      bioguide_id: bioguideId,
      name: member.name,
      party: member.party ?? "?",
      state: member.state ?? "?",
      cross_vote_count: score.crossVotes,
      deciding_score: score.decidingScore,
      congress_gov_url: congressGovMemberUrl(bioguideId),
      recent_example: score.recent,
    });
  }

  return defectors
    .sort((a, b) => b.deciding_score - a.deciding_score || b.cross_vote_count - a.cross_vote_count)
    .slice(0, limit);
}

export async function computeRollDefectors(
  db: D1Database,
  roll: RollCallKey
): Promise<VoteDefectorEntry[]> {
  const rows = await selectMemberVotesForRoll(db, roll);
  if (rows.length === 0) return [];

  const excludeLocalSample = await hasRealMemberRoster(db);
  const filteredRows = excludeLocalSample
    ? rows.filter((row) => isRealBioguideId(row.bioguide_id))
    : rows;
  if (filteredRows.length === 0) return [];

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

  const partyMajorities = partyMajoritiesForRoll(
    filteredRows.map((row) => ({
      party: members.get(row.bioguide_id)?.party ?? null,
      position: row.position,
    }))
  );

  const defectors: VoteDefectorEntry[] = [];
  for (const row of filteredRows) {
    const member = members.get(row.bioguide_id);
    if (!member?.party) continue;
    const partyKey = normalizePartyCode(member.party);
    const partyLine = partyMajorities.get(partyKey) ?? null;
    const memberSide = normalizePosition(row.position);
    if (partyLine === null || memberSide === "other" || memberSide === partyLine) continue;

    defectors.push({
      bioguide_id: row.bioguide_id,
      name: member.name,
      party: member.party,
      state: member.state ?? "?",
      position: memberSide,
      party_line: partyLine,
      congress_gov_url: congressGovMemberUrl(row.bioguide_id),
    });
  }

  return defectors.sort((a, b) => a.name.localeCompare(b.name));
}
