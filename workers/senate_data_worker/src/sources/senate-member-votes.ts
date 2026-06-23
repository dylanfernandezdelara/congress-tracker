import { congressNumber, sessionNumber } from "../config";
import type { Env } from "../config";
import type { MemberRecord, MemberVoteRecord } from "../types";
import { fetchText } from "./http";
import { getTag } from "./senate-xml";

function memberId(lisMemberId: string): string {
  return lisMemberId ? `LIS:${lisMemberId}` : "";
}

export function parseSenateMemberVoteXml(
  xml: string,
  congress: number,
  session: number,
  rollNumber: number
): { members: MemberRecord[]; votes: MemberVoteRecord[] } {
  const members: MemberRecord[] = [];
  const votes: MemberVoteRecord[] = [];
  const blocks = xml.match(/<member>[\s\S]*?<\/member>/gi) ?? [];

  for (const block of blocks) {
    const lisId = getTag(block, "lis_member_id");
    const id = memberId(lisId);
    if (!id) continue;

    const first = getTag(block, "first_name");
    const last = getTag(block, "last_name");
    const full = getTag(block, "member_full") || [first, last].filter(Boolean).join(" ");
    const party = getTag(block, "party");
    const state = getTag(block, "state");
    const position = getTag(block, "vote_cast");
    if (!position) continue;

    members.push({
      bioguideId: id,
      name: full,
      chamber: "Senate",
      party: party || null,
      state: state || null,
      district: null,
    });
    votes.push({
      chamber: "Senate",
      congress,
      session,
      rollNumber,
      bioguideId: id,
      position,
    });
  }

  return { members, votes };
}

export async function fetchSenateMemberVotes(
  env: Env,
  congress: number,
  session: number,
  rollNumber: number
): Promise<{ members: MemberRecord[]; votes: MemberVoteRecord[] }> {
  const padded = String(rollNumber).padStart(5, "0");
  const url = `https://www.senate.gov/legislative/LIS/roll_call_votes/vote${congress}${session}/vote_${congress}_${session}_${padded}.xml`;
  const xml = await fetchText(url);
  return parseSenateMemberVoteXml(xml, congress, session, rollNumber);
}

export async function fetchSenateMemberVotesForEnv(
  env: Env,
  rollNumber: number
): Promise<{ members: MemberRecord[]; votes: MemberVoteRecord[] }> {
  return fetchSenateMemberVotes(env, congressNumber(env), sessionNumber(env), rollNumber);
}
