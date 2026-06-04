/**
 * Congress.gov senator and member legislation fetchers.
 */

import { fetchJsonWithRetry, type FetchConfig } from "../fetch";
import { compareDates } from "../date-parse";
import {
  buildCongressUrl,
} from "../sources/congress-client";
import type {
  LegislationActionItem,
  MemberIndexEntry,
} from "../types";
import {
  normalizeDate,
  isDateInRange,
  getLegislationArray,
  buildBillRef,
  type CongressPagination,
} from "./internal";

interface CongressMember {
  bioguideId?: string;
  name?: string;
  partyName?: string;
  state?: string;
  url?: string;
  terms?: {
    item?: Array<{
      chamber?: string;
      startYear?: number;
    }>;
  };
}

interface CongressMemberListResponse {
  members?: CongressMember[];
  pagination?: CongressPagination;
}

interface CongressLegislationAction {
  actionDate?: string;
  text?: string;
}

interface CongressBill {
  congress?: number;
  type?: string;
  number?: string;
  title?: string;
  url?: string;
}

interface CongressLegislationItem {
  latestAction?: CongressLegislationAction;
  title?: string;
  congress?: number;
  type?: string;
  number?: string;
  url?: string;
  bill?: CongressBill;
}

interface CongressLegislationResponse {
  sponsoredLegislation?: CongressLegislationItem[];
  cosponsoredLegislation?: CongressLegislationItem[];
  bills?: CongressLegislationItem[];
  results?: CongressLegislationItem[];
  pagination?: CongressPagination;
}

function toMemberIndexEntry(member: CongressMember): MemberIndexEntry | null {
  const bioguideId = member.bioguideId?.trim();
  if (!bioguideId) return null;
  return {
    bioguide_id: bioguideId,
    name: member.name?.trim() || bioguideId,
    party: normalizeParty(member.partyName),
    state: normalizeStateName(member.state),
    chamber: "Senate",
    url: member.url,
  };
}

function normalizeParty(partyName?: string): string {
  const value = (partyName ?? "").toLowerCase();
  if (!value) return "";
  if (value.includes("democrat")) return "D";
  if (value.includes("republican")) return "R";
  if (value.includes("independent")) return "I";
  return partyName?.trim().charAt(0).toUpperCase() ?? "";
}

const STATE_ABBREVIATIONS: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "district of columbia": "DC",
};

function normalizeStateName(state?: string): string {
  const trimmed = state?.trim();
  if (!trimmed) return "";
  if (trimmed.length === 2) return trimmed.toUpperCase();
  const lookup = STATE_ABBREVIATIONS[trimmed.toLowerCase()];
  return lookup ?? trimmed.toUpperCase();
}

function isSenateMember(member: CongressMember): boolean {
  const terms = member.terms?.item ?? [];
  return terms.some((term) => (term.chamber ?? "").toLowerCase() === "senate");
}

async function fetchMemberLegislationPage(
  bioguideId: string,
  item: string,
  apiKey: string,
  params: Record<string, string | number | boolean>,
  config: FetchConfig
): Promise<{ data: CongressLegislationResponse | null; error?: string }> {
  const primaryUrl = buildCongressUrl(`/member/${bioguideId}`, { item, ...params }, apiKey);
  const primary = await fetchJsonWithRetry<CongressLegislationResponse>(primaryUrl, config);
  if (primary.success && primary.data) {
    return { data: primary.data };
  }

  // Fallback to path-based endpoint if item query param is not supported.
  const fallbackUrl = buildCongressUrl(`/member/${bioguideId}/${item}`, params, apiKey);
  const fallback = await fetchJsonWithRetry<CongressLegislationResponse>(fallbackUrl, config);
  if (fallback.success && fallback.data) {
    return { data: fallback.data };
  }

  return { data: null, error: fallback.error ?? primary.error ?? "Unknown error" };
}

export async function fetchCurrentSenators(
  congress: number,
  apiKey: string,
  config: FetchConfig = {}
): Promise<MemberIndexEntry[]> {
  const members: MemberIndexEntry[] = [];
  let offset = 0;
  const limit = 250;

  while (true) {
    const url = buildCongressUrl(
      `/member/congress/${congress}`,
      {
        currentMember: true,
        limit,
        offset,
      },
      apiKey
    );
    const result = await fetchJsonWithRetry<CongressMemberListResponse>(url, config);
    if (!result.success || !result.data) {
      break;
    }
    const batch = (result.data.members ?? [])
      .filter(isSenateMember)
      .map(toMemberIndexEntry)
      .filter((m): m is MemberIndexEntry => m !== null);
    members.push(...batch);

    const pagination = result.data.pagination;
    if (pagination?.next) {
      offset += limit;
      continue;
    }
    if (pagination?.count !== undefined && pagination?.offset !== undefined) {
      if (pagination.offset + limit < pagination.count) {
        offset += limit;
        continue;
      }
    }
    if (batch.length < limit) {
      break;
    }
    offset += limit;
  }

  members.sort((a, b) => a.name.localeCompare(b.name));
  return members;
}

export async function fetchMemberLegislationActions(
  bioguideId: string,
  congress: number,
  role: "sponsor" | "cosponsor",
  windowStart: string,
  windowEnd: string,
  apiKey: string,
  config: FetchConfig = {}
): Promise<{ actions: LegislationActionItem[]; error?: string }> {
  const item = role === "sponsor" ? "sponsored-legislation" : "cosponsored-legislation";
  const limit = 250;
  let offset = 0;
  const actions: LegislationActionItem[] = [];
  let fallbackAction: LegislationActionItem | null = null;
  let errorMessage: string | undefined;

  while (true) {
    const { data, error } = await fetchMemberLegislationPage(
      bioguideId,
      item,
      apiKey,
      { limit, offset },
      config
    );
    if (!data) {
      if (error && !errorMessage) {
        errorMessage = error;
      }
      break;
    }

    const items = getLegislationArray(data);
    for (const entry of items) {
      const actionDate = normalizeDate(entry.latestAction?.actionDate);
      if (!actionDate) {
        continue;
      }

      const actionText = entry.latestAction?.text?.trim() || "Latest action";
      const candidate: LegislationActionItem = {
        source: "congress",
        type: "legislation_action",
        role,
        action_date: actionDate,
        action_text: actionText,
        bill: buildBillRef(entry, congress),
        is_recent: false,
      };

      if (isDateInRange(actionDate, windowStart, windowEnd)) {
        actions.push({ ...candidate, is_recent: true });
        continue;
      }

      if (
        !fallbackAction ||
        compareDates(actionDate, fallbackAction.action_date) > 0
      ) {
        fallbackAction = candidate;
      }
    }

    const pagination = data.pagination;
    if (pagination?.next) {
      offset += limit;
      continue;
    }
    if (pagination?.count !== undefined && pagination?.offset !== undefined) {
      if (pagination.offset + limit < pagination.count) {
        offset += limit;
        continue;
      }
    }
    if (items.length < limit) {
      break;
    }
    offset += limit;
  }

  if (errorMessage) {
    console.warn(`[congress] ${bioguideId} ${item} fetch failed: ${errorMessage}`);
  }
  if (actions.length === 0 && fallbackAction) {
    actions.push(fallbackAction);
  }
  return { actions, error: errorMessage };
}
