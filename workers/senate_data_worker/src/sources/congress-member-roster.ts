import type { Env } from "../config";
import { congressNumber } from "../config";
import { senateMemberLookupKey } from "../../../../shared/member-id";
import { normalizePartyCode } from "../../../../shared/party";
import type { Chamber, MemberRecord } from "../types";
import { fetchJson, nextPageUrl } from "./http";

interface CongressMemberTerm {
  chamber?: string;
  startYear?: number;
  endYear?: number;
}

interface CongressMemberListItem {
  bioguideId?: string;
  name?: string;
  partyName?: string;
  state?: string;
  district?: number | null;
  terms?: {
    item?: CongressMemberTerm | CongressMemberTerm[];
  };
}

interface CongressMemberListResponse {
  members?: CongressMemberListItem[];
  pagination?: { next?: string };
}

const STATE_NAME_TO_CODE: Record<string, string> = {
  Alabama: "AL",
  Alaska: "AK",
  Arizona: "AZ",
  Arkansas: "AR",
  California: "CA",
  Colorado: "CO",
  Connecticut: "CT",
  Delaware: "DE",
  "District of Columbia": "DC",
  Florida: "FL",
  Georgia: "GA",
  Hawaii: "HI",
  Idaho: "ID",
  Illinois: "IL",
  Indiana: "IN",
  Iowa: "IA",
  Kansas: "KS",
  Kentucky: "KY",
  Louisiana: "LA",
  Maine: "ME",
  Maryland: "MD",
  Massachusetts: "MA",
  Michigan: "MI",
  Minnesota: "MN",
  Mississippi: "MS",
  Missouri: "MO",
  Montana: "MT",
  Nebraska: "NE",
  Nevada: "NV",
  "New Hampshire": "NH",
  "New Jersey": "NJ",
  "New Mexico": "NM",
  "New York": "NY",
  "North Carolina": "NC",
  "North Dakota": "ND",
  Ohio: "OH",
  Oklahoma: "OK",
  Oregon: "OR",
  Pennsylvania: "PA",
  "Puerto Rico": "PR",
  "Rhode Island": "RI",
  "South Carolina": "SC",
  "South Dakota": "SD",
  Tennessee: "TN",
  Texas: "TX",
  Utah: "UT",
  Vermont: "VT",
  Virginia: "VA",
  Washington: "WA",
  "West Virginia": "WV",
  Wisconsin: "WI",
  Wyoming: "WY",
};

function termItems(terms?: CongressMemberListItem["terms"]): CongressMemberTerm[] {
  const item = terms?.item;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

function memberChamber(terms: CongressMemberTerm[]): Chamber | null {
  const sorted = [...terms].sort((a, b) => (b.startYear ?? 0) - (a.startYear ?? 0));
  const latest = sorted[0];
  if (!latest?.chamber) return null;
  if (latest.chamber === "Senate") return "Senate";
  if (latest.chamber === "House of Representatives") return "House";
  return null;
}

export function senateLookupKeyFromCongressItem(item: CongressMemberListItem): string | null {
  if (!item.name || !item.state || !item.partyName) return null;
  const invertedLast = item.name.split(",")[0]?.trim();
  if (!invertedLast) return null;
  const party = normalizePartyCode(item.partyName);
  if (party === "Other") return null;
  const state = normalizeStateCode(item.state);
  if (!state) return null;
  return senateMemberLookupKey(invertedLast, state, party);
}

export function normalizeStateCode(state: string | undefined): string | null {
  if (!state) return null;
  const trimmed = state.trim();
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  return STATE_NAME_TO_CODE[trimmed] ?? null;
}

export function displayNameFromInverted(inverted: string): string {
  const comma = inverted.indexOf(",");
  if (comma === -1) return inverted.trim();
  const last = inverted.slice(0, comma).trim();
  const rest = inverted.slice(comma + 1).trim();
  if (!rest) return last;
  return `${rest} ${last}`.trim();
}

export function parseCongressMemberListItem(item: CongressMemberListItem): MemberRecord | null {
  if (!item.bioguideId || !item.name) return null;

  const terms = termItems(item.terms);
  const chamber = memberChamber(terms);
  if (!chamber) return null;

  const partyCode = normalizePartyCode(item.partyName);
  const party = partyCode === "Other" ? item.partyName ?? null : partyCode;

  return {
    bioguideId: item.bioguideId,
    name: displayNameFromInverted(item.name),
    chamber,
    party,
    state: normalizeStateCode(item.state),
    district: chamber === "House" ? (item.district ?? null) : null,
  };
}


/**
 * Fetch the current-member roster for the configured Congress from Congress.gov.
 * Paginates until all members are retrieved (~535 for the 119th).
 */
export async function fetchCongressMemberRoster(env: Env): Promise<{
  members: MemberRecord[];
  senateBioguideLookup: Record<string, string>;
}> {
  const apiKey = env.CONGRESS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("CONGRESS_API_KEY is required for member roster ingest");
  }

  const congress = congressNumber(env);
  let nextUrl: string | null =
    `https://api.congress.gov/v3/member/congress/${congress}?currentMember=true&format=json&limit=250&api_key=${apiKey}`;

  const members: MemberRecord[] = [];
  const senateBioguideLookup: Record<string, string> = {};
  const seen = new Set<string>();

  while (nextUrl) {
    const pageUrl = nextUrl;
    const data: CongressMemberListResponse = await fetchJson<CongressMemberListResponse>(pageUrl);
    for (const item of data.members ?? []) {
      const parsed = parseCongressMemberListItem(item);
      if (!parsed || seen.has(parsed.bioguideId)) continue;
      seen.add(parsed.bioguideId);
      members.push(parsed);
      const lookupKey = senateLookupKeyFromCongressItem(item);
      if (lookupKey && parsed.chamber === "Senate") {
        senateBioguideLookup[lookupKey] = parsed.bioguideId;
      }
    }
    nextUrl = nextPageUrl(data.pagination?.next, apiKey);
  }

  return { members, senateBioguideLookup };
}
