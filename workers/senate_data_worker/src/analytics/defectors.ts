import type { Chamber, DefectorEntry } from "../types";
import { getMembersByIds } from "../d1/members";
import { selectMemberVotesForSession } from "../d1/member-votes";

const YEA_POSITIONS = new Set(["Yea", "Aye", "Yes"]);
const NAY_POSITIONS = new Set(["Nay", "No"]);

function normalizePosition(position: string): "yea" | "nay" | "other" {
  const trimmed = position.trim();
  if (YEA_POSITIONS.has(trimmed)) return "yea";
  if (NAY_POSITIONS.has(trimmed)) return "nay";
  return "other";
}

function partyMajority(
  positions: Array<{ party: string | null; position: string }>
): "yea" | "nay" | null {
  const counts = new Map<string, number>();
  for (const { party, position } of positions) {
    if (!party) continue;
    const norm = normalizePosition(position);
    if (norm === "other") continue;
    const key = `${party}:${norm}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  let best: { party: string; side: "yea" | "nay"; count: number } | null = null;
  for (const [key, count] of counts) {
    const [party, side] = key.split(":");
    if (!best || count > best.count) {
      best = { party, side: side as "yea" | "nay", count };
    }
  }
  return best?.side ?? null;
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

  const uniqueIds = [...new Set(rows.map((row) => row.bioguide_id))];
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
    const partyPositions = rollRows.map((r) => ({
      party: members.get(r.bioguide_id)?.party ?? null,
      position: r.position,
    }));

    for (const row of rollRows) {
      const member = members.get(row.bioguide_id);
      if (!member?.party) continue;
      const partySide = partyMajority(
        partyPositions.filter((p) => p.party === member.party)
      );
      const memberSide = normalizePosition(row.position);
      if (partySide === null || memberSide === "other" || memberSide === partySide) continue;

      const current = scores.get(row.bioguide_id) ?? { crossVotes: 0, decidingScore: 0 };
      current.crossVotes += 1;
      current.decidingScore += weight;
      current.recent = {
        bill_type: row.bill_type,
        bill_number: row.bill_number,
        congress: row.bill_congress,
        margin,
      };
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
