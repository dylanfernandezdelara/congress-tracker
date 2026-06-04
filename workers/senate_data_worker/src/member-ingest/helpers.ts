/**
 * Member ingestion vote matching and bill reference helpers.
 */

import { compareDates } from "../date-parse";
import { buildBillKey } from "../congress";
import { normalizePartyCode } from "../domain/party-majority";
import type { MemberIndexEntry, RollCallVoteItem } from "../types";
import type { MemberVote } from "../xml";

export function isDateInRange(date: string, start: string, end: string): boolean {
  return compareDates(date, start) >= 0 && compareDates(date, end) <= 0;
}

function extractNameParts(raw: string): {
  full: string;
  last: string;
  first?: string;
  firstInitial?: string;
} {
  const withoutParens = raw.replace(/\s*\(.*\)\s*$/, "").trim();
  if (!withoutParens) {
    return { full: "", last: "" };
  }
  if (withoutParens.includes(",")) {
    const [last, rest] = withoutParens.split(",", 2).map((part) => part.trim());
    const first = rest?.split(/\s+/)[0];
    return {
      full: withoutParens,
      last: last || withoutParens,
      first,
      firstInitial: first ? first[0]?.toLowerCase() : undefined,
    };
  }
  const parts = withoutParens.split(/\s+/);
  const last = parts[parts.length - 1] ?? withoutParens;
  const first = parts[0];
  return {
    full: withoutParens,
    last,
    first,
    firstInitial: first ? first[0]?.toLowerCase() : undefined,
  };
}

export function buildMembersByState(
  members: MemberIndexEntry[]
): Map<string, MemberIndexEntry[]> {
  const byState = new Map<string, MemberIndexEntry[]>();
  for (const member of members) {
    const state = member.state.toUpperCase();
    const list = byState.get(state) ?? [];
    list.push(member);
    byState.set(state, list);
  }
  return byState;
}

export function matchMemberForVote(
  vote: MemberVote,
  membersByState: Map<string, MemberIndexEntry[]>
): MemberIndexEntry | null {
  const candidates = membersByState.get(vote.state.toUpperCase()) ?? [];
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const voteName = extractNameParts(vote.member_full);
  const matchingLast = candidates.filter((member) => {
    const memberName = extractNameParts(member.name);
    return memberName.last.toLowerCase() === voteName.last.toLowerCase();
  });

  if (matchingLast.length === 1) return matchingLast[0];
  if (matchingLast.length > 1 && voteName.firstInitial) {
    const matchingFirst = matchingLast.filter((member) => {
      const memberName = extractNameParts(member.name);
      return memberName.firstInitial === voteName.firstInitial;
    });
    if (matchingFirst.length === 1) return matchingFirst[0];
    return matchingFirst[0] ?? matchingLast[0] ?? null;
  }

  return matchingLast[0] ?? candidates[0] ?? null;
}

function extractBillRefFromText(
  text: string,
  congress: number
): RollCallVoteItem["bill"] | null {
  const match = text.match(
    /\b(S\.?J\.?RES\.?|S\.?CON\.?RES\.?|S\.?RES\.?|S\.?|H\.?J\.?RES\.?|H\.?CON\.?RES\.?|H\.?RES\.?|H\.?R\.?)\s*\.?\s*(\d+)\b/i
  );
  if (!match) return null;
  const rawType = match[1].toUpperCase().replace(/\s+/g, "");
  const number = match[2];
  const normalized = rawType.replace(/\./g, "");
  const type =
    normalized === "HR"
      ? "H.R."
      : normalized === "S"
        ? "S"
        : normalized === "HJRES"
          ? "H.J.RES."
          : normalized === "SJRES"
            ? "S.J.RES."
            : normalized === "HRES"
              ? "H.RES."
              : normalized === "SRES"
                ? "S.RES."
                : normalized === "HCONRES"
                  ? "H.CON.RES."
                  : normalized === "SCONRES"
                    ? "S.CON.RES."
                    : rawType;
  return {
    congress,
    type,
    number,
  };
}

export function extractBillRefFromVote(details: {
  congress: number;
  vote_document?: string;
  vote_title?: string;
  vote_question?: string;
}): RollCallVoteItem["bill"] | null {
  const candidates = [
    details.vote_document,
    details.vote_title,
    details.vote_question,
  ].filter((value): value is string => Boolean(value && value.trim()));
  for (const candidate of candidates) {
    const bill = extractBillRefFromText(candidate, details.congress);
    if (bill) return bill;
  }
  return null;
}

export function extractTopicsFromBill(bill: RollCallVoteItem["bill"]): string[] {
  if (!bill) return [];
  const topics = new Set<string>();
  if (bill.policy_area) topics.add(bill.policy_area);
  for (const subject of bill.subjects ?? []) {
    if (subject) topics.add(subject);
  }
  for (const committee of bill.committees ?? []) {
    if (committee?.name) topics.add(committee.name);
  }
  return Array.from(topics);
}

export function normalizeVoteCast(value: string): string {
  const cleaned = value.trim().toLowerCase();
  if (!cleaned) return "UNKNOWN";
  if (cleaned.includes("yea") || cleaned.includes("aye") || cleaned === "yes") {
    return "YEA";
  }
  if (cleaned.includes("nay") || cleaned === "no") {
    return "NAY";
  }
  if (cleaned.includes("present")) {
    return "PRESENT";
  }
  if (cleaned.includes("not voting") || cleaned.includes("absent")) {
    return "NOT_VOTING";
  }
  return cleaned.toUpperCase().replace(/\s+/g, "_");
}

export function computePartyMajorityByParty(memberVotes: MemberVote[]): Map<string, string> {
  const partyCounts = new Map<string, Map<string, number>>();
  for (const vote of memberVotes) {
    const party = normalizePartyCode(vote.party);
    if (!party) continue;
    const voteCast = normalizeVoteCast(vote.vote_cast);
    const counts = partyCounts.get(party) ?? new Map<string, number>();
    counts.set(voteCast, (counts.get(voteCast) ?? 0) + 1);
    partyCounts.set(party, counts);
  }

  const majorityByParty = new Map<string, string>();
  for (const [party, counts] of partyCounts.entries()) {
    let bestVote = "";
    let bestCount = -1;
    let tied = false;
    for (const [voteCast, count] of counts.entries()) {
      if (count > bestCount) {
        bestVote = voteCast;
        bestCount = count;
        tied = false;
      } else if (count === bestCount) {
        tied = true;
      }
    }
    if (!tied && bestVote) {
      majorityByParty.set(party, bestVote);
    }
  }
  return majorityByParty;
}
