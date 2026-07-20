import { normalizePartyCode } from "../../../../shared/party";
import { normalizeVotePosition } from "../../../../shared/vote-positions";
import { partyMajoritiesForRoll } from "./roll-party-stats";

export type RollCrossVote = {
  bioguideId: string;
  position: "yea" | "nay";
  partyLine: "yea" | "nay";
};

/**
 * Members who voted against their party's majority on a single roll.
 * Shared by defector rankings and per-member profile stats.
 */
export function rollCrossVotes(
  positions: Array<{ bioguideId: string; party: string | null; position: string }>
): RollCrossVote[] {
  const partyMajorities = partyMajoritiesForRoll(
    positions.map((row) => ({ party: row.party, position: row.position }))
  );

  const out: RollCrossVote[] = [];
  for (const row of positions) {
    if (!row.party) continue;
    const partyKey = normalizePartyCode(row.party);
    const partyLine = partyMajorities.get(partyKey) ?? null;
    const memberSide = normalizeVotePosition(row.position);
    if (partyLine === null || memberSide === "other" || memberSide === partyLine) continue;
    out.push({
      bioguideId: row.bioguideId,
      position: memberSide,
      partyLine,
    });
  }
  return out;
}
