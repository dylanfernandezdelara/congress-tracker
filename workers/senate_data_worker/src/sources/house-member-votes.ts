import type { Env } from "../config";
import type { MemberRecord, MemberVoteRecord } from "../types";
import { fetchJson } from "./http";

interface HouseMemberVoteItem {
  bioguideId?: string;
  firstName?: string;
  lastName?: string;
  voteParty?: string;
  voteState?: string;
  votePosition?: string;
}

interface HouseMemberVotesResponse {
  houseRollCallVoteMembers?: HouseMemberVoteItem[];
}

function memberName(first?: string, last?: string): string {
  return [first, last].filter(Boolean).join(" ").trim() || "Unknown";
}

export async function fetchHouseMemberVotes(
  env: Env,
  congress: number,
  session: number,
  rollNumber: number
): Promise<{ members: MemberRecord[]; votes: MemberVoteRecord[] }> {
  const apiKey = env.CONGRESS_API_KEY;
  const url = `https://api.congress.gov/v3/house-vote/${congress}/${session}/${rollNumber}/members?format=json&api_key=${apiKey}`;
  const data = await fetchJson<HouseMemberVotesResponse>(url);
  const items = data.houseRollCallVoteMembers ?? [];

  const members: MemberRecord[] = [];
  const votes: MemberVoteRecord[] = [];

  for (const item of items) {
    if (!item.bioguideId || !item.votePosition) continue;
    members.push({
      bioguideId: item.bioguideId,
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
      bioguideId: item.bioguideId,
      position: item.votePosition,
    });
  }

  return { members, votes };
}
