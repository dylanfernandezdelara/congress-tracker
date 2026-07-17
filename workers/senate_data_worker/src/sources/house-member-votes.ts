import type { Env } from "../config";
import type { MemberRecord, MemberVoteRecord } from "../types";
import { fetchJson } from "./http";

/** Congress.gov beta house-vote members item (current field names). */
interface HouseMemberVoteItem {
  bioguideID?: string;
  bioguideId?: string;
  firstName?: string;
  lastName?: string;
  voteParty?: string;
  voteState?: string;
  /** Current Congress.gov field. */
  voteCast?: string;
  /** Older / alternate field name kept for resilience. */
  votePosition?: string;
}

interface HouseMemberVotesPage {
  results?: HouseMemberVoteItem[];
}

interface HouseMemberVotesResponse {
  /** Current Congress.gov envelope. */
  houseRollCallVoteMemberVotes?: HouseMemberVotesPage;
  /** Legacy flat array shape (unused by current API; kept for resilience). */
  houseRollCallVoteMembers?: HouseMemberVoteItem[];
  pagination?: { next?: string };
}

function memberName(first?: string, last?: string): string {
  return [first, last].filter(Boolean).join(" ").trim() || "Unknown";
}

function appendApiKey(url: string, apiKey: string): string {
  const parsed = new URL(url);
  if (!parsed.searchParams.has("api_key")) {
    parsed.searchParams.set("api_key", apiKey);
  }
  return parsed.toString();
}

function pageItems(data: HouseMemberVotesResponse): HouseMemberVoteItem[] {
  const nested = data.houseRollCallVoteMemberVotes?.results;
  if (Array.isArray(nested)) return nested;
  if (Array.isArray(data.houseRollCallVoteMembers)) return data.houseRollCallVoteMembers;
  return [];
}

/**
 * Fetch per-member positions for a House roll call from Congress.gov.
 * Paginates with limit=250 (House rosters exceed the API default of 20).
 */
export async function fetchHouseMemberVotes(
  env: Env,
  congress: number,
  session: number,
  rollNumber: number
): Promise<{ members: MemberRecord[]; votes: MemberVoteRecord[] }> {
  const apiKey = env.CONGRESS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("CONGRESS_API_KEY is required for House member vote ingest");
  }

  let nextUrl: string | null =
    `https://api.congress.gov/v3/house-vote/${congress}/${session}/${rollNumber}/members?format=json&limit=250&api_key=${apiKey}`;

  const members: MemberRecord[] = [];
  const votes: MemberVoteRecord[] = [];
  const seen = new Set<string>();

  while (nextUrl) {
    const pageUrl = nextUrl;
    const data: HouseMemberVotesResponse = await fetchJson<HouseMemberVotesResponse>(pageUrl);
    for (const item of pageItems(data)) {
      const bioguideId = item.bioguideID ?? item.bioguideId;
      const position = item.voteCast ?? item.votePosition;
      if (!bioguideId || !position) continue;
      if (seen.has(bioguideId)) continue;
      seen.add(bioguideId);
      members.push({
        bioguideId,
        name: memberName(item.firstName, item.lastName),
        chamber: "House",
        party: item.voteParty ?? null,
        state: item.voteState ?? null,
        district: null,
      });
      votes.push({
        chamber: "House",
        congress,
        session,
        rollNumber,
        bioguideId,
        position,
      });
    }
    nextUrl = data.pagination?.next ? appendApiKey(data.pagination.next, apiKey) : null;
  }

  return { members, votes };
}
