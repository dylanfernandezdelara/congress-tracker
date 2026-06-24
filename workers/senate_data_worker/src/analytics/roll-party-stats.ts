import { normalizePartyCode } from "../../../../shared/party";
import { normalizeVotePosition } from "../../../../shared/vote-positions";

export type RollPartyPosition = {
  party: string | null;
  position: string;
};

/**
 * Majority side (yea/nay) for each party on a single roll. Computed once per
 * roll so per-member defection checks stay O(members).
 */
export function partyMajoritiesForRoll(
  positions: RollPartyPosition[]
): Map<string, "yea" | "nay" | null> {
  const tallies = new Map<string, { yea: number; nay: number }>();
  for (const { party, position } of positions) {
    if (!party) continue;
    const partyKey = normalizePartyCode(party);
    if (partyKey === "Other") continue;
    const norm = normalizeVotePosition(position);
    if (norm === "other") continue;
    const tally = tallies.get(partyKey) ?? { yea: 0, nay: 0 };
    tally[norm] += 1;
    tallies.set(partyKey, tally);
  }

  const majorities = new Map<string, "yea" | "nay" | null>();
  for (const [party, tally] of tallies) {
    if (tally.yea === 0 && tally.nay === 0) {
      majorities.set(party, null);
    } else {
      majorities.set(party, tally.yea >= tally.nay ? "yea" : "nay");
    }
  }
  return majorities;
}
