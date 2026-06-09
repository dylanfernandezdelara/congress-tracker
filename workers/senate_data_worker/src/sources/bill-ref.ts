import type { BillRef } from "../types";

const ISSUE_BILL = /^([HS])\.?\s*([A-Z]*)\s*\.?\s*(\d+)/i;
const ISSUE_HOUSE = /^H\.?\s*R\.?\s*(\d+)/i;

/** Parse Senate vote_menu issue field (e.g. "S. 1318", "H.R. 1234"). */
export function parseSenateIssue(issue: string, congress: number): BillRef | null {
  const trimmed = issue.trim();
  if (/^PN/i.test(trimmed)) return null;

  const hr = trimmed.match(ISSUE_HOUSE);
  if (hr) {
    return { congress, type: "HR", number: Number.parseInt(hr[1], 10) };
  }

  const m = trimmed.match(ISSUE_BILL);
  if (!m) return null;

  const chamber = m[1].toUpperCase();
  const subtype = (m[2] ?? "").toUpperCase();
  const num = Number.parseInt(m[3], 10);
  if (Number.isNaN(num)) return null;

  if (chamber === "H") {
    const type = subtype === "JRES" || subtype === "JR" ? "HJRES" : subtype === "RES" ? "HRES" : "HR";
    return { congress, type, number: num };
  }
  const type = subtype === "JRES" || subtype === "JR" ? "SJRES" : subtype === "RES" ? "SRES" : "S";
  return { congress, type, number: num };
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
