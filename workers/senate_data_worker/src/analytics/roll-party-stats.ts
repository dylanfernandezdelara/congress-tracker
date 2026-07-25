import { normalizePartyCode } from "../../../../shared/party";
import type { RollPartySplit } from "../../../../shared/stats-api-types";
import { normalizeVotePosition } from "../../../../shared/vote-positions";

export type RollPartyPosition = {
  party: string | null;
  position: string;
};

export type PartyTally = { yea: number; nay: number };

/**
 * Yea/nay counts per party for a single roll. Computed once per roll so both
 * defection checks and the displayed party split share one source of truth.
 */
export function partyTalliesForRoll(
  positions: RollPartyPosition[]
): Map<string, PartyTally> {
  const tallies = new Map<string, PartyTally>();
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
  return tallies;
}

/**
 * Majority side (yea/nay) for each party on a single roll. A tie counts as yea
 * so a party line is always defined when the party cast votes.
 */
export function partyMajoritiesForRoll(
  positions: RollPartyPosition[]
): Map<string, "yea" | "nay" | null> {
  const majorities = new Map<string, "yea" | "nay" | null>();
  for (const [party, tally] of partyTalliesForRoll(positions)) {
    if (tally.yea === 0 && tally.nay === 0) {
      majorities.set(party, null);
    } else {
      majorities.set(party, tally.yea >= tally.nay ? "yea" : "nay");
    }
  }
  return majorities;
}

/**
 * Per-party split for display, largest caucus first. Surfacing this alongside a
 * defector list is what makes "voted Yea (party Nay)" legible: without the
 * counts, a list of same-party defectors reads as if the whole caucus split.
 */
export function rollPartySplits(positions: RollPartyPosition[]): RollPartySplit[] {
  const splits: RollPartySplit[] = [];
  for (const [party, tally] of partyTalliesForRoll(positions)) {
    const total = tally.yea + tally.nay;
    if (total === 0) continue;
    splits.push({
      party,
      yeas: tally.yea,
      nays: tally.nay,
      party_line: tally.yea >= tally.nay ? "yea" : "nay",
    });
  }
  return splits.sort(
    (a, b) => b.yeas + b.nays - (a.yeas + a.nays) || a.party.localeCompare(b.party)
  );
}
