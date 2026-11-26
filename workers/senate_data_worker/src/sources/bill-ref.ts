import type { BillRef } from "../types";

/**
 * Senate vote_menu issue, compacted: "H.Con.Res. 93" -> "HCONRES93". Longest types first so "S.J.Res." is not read
 * as "S.". Without this, every joint and concurrent resolution ("S.J.Res. 197", "H.Con.Res. 93") was dropped.
 */
const ISSUE_COMPACT = /^(HCONRES|SCONRES|HJRES|SJRES|HRES|SRES|HR|S)(\d+)/;

/** Parse Senate vote_menu issue field (e.g. "S. 1318", "H.R. 1234", "S.J.Res. 197", "H.Con.Res. 93"). */
export function parseSenateIssue(issue: string, congress: number): BillRef | null {
  const trimmed = issue.trim();
  if (/^PN/i.test(trimmed)) return null;
  const m = trimmed.toUpperCase().replace(/[.\s]/g, "").match(ISSUE_COMPACT);
  if (!m) return null;
  const num = Number.parseInt(m[2], 10);
  if (Number.isNaN(num)) return null;
  return { congress, type: m[1], number: num };
}

/** Normalize congress.gov legislationType (e.g. HRES, HR, S). */
export function parseHouseLegislation(
  legislationType: string,
  legislationNumber: string,
  congress: number
): BillRef | null {
  const type = legislationType.toUpperCase().replace(/\s+/g, "");
  const number = Number.parseInt(legislationNumber, 10);
  if (Number.isNaN(number) || !type) return null;
  return { congress, type, number };
}
