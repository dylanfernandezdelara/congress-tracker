import type { VoteLedgerEntry } from "../types";
import type { VoteCast } from "../platform-types";
import { classifyVote } from "./vote-cast";

export function normalizePartyCode(value: string | undefined): string {
  const normalized = (value ?? "").trim().toUpperCase();
  if (!normalized) return "";
  if (normalized.startsWith("D")) return "D";
  if (normalized.startsWith("R")) return "R";
  if (normalized === "I" || normalized.startsWith("IND")) return "I";
  return normalized;
}

export function computePartyMajority(
  entry: VoteLedgerEntry,
  partyById: Map<string, string>
): Map<string, VoteCast> {
  const tallies = new Map<string, { yea: number; nay: number }>();
  for (const [bioguideId, rawCast] of Object.entries(entry.member_votes)) {
    const party = partyById.get(bioguideId);
    if (!party) continue;
    const cast = classifyVote(rawCast);
    if (cast !== "yea" && cast !== "nay") continue;
    const tally = tallies.get(party) ?? { yea: 0, nay: 0 };
    if (cast === "yea") tally.yea += 1;
    else tally.nay += 1;
    tallies.set(party, tally);
  }

  const majority = new Map<string, VoteCast>();
  for (const [party, tally] of tallies.entries()) {
    majority.set(party, tally.yea >= tally.nay ? "yea" : "nay");
  }
  return majority;
}

export function computePartyMajorityLabels(
  entry: VoteLedgerEntry,
  partyById: Map<string, string>
): Map<string, "Yea" | "Nay"> {
  const majority = computePartyMajority(entry, partyById);
  const labels = new Map<string, "Yea" | "Nay">();
  for (const [party, cast] of majority.entries()) {
    labels.set(party, cast === "yea" ? "Yea" : "Nay");
  }
  return labels;
}
