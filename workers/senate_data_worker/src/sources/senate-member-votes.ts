import { congressNumber, sessionNumber } from "../config";
import type { Env } from "../config";
import type { MemberRecord, MemberVoteRecord } from "../types";
import { senateMemberLookupKey } from "../../../../shared/member-id";
import { normalizePartyCode } from "../../../../shared/party";
import { fetchSenateLegislativeText } from "./senate-fetch";
import { getTag } from "./senate-xml";

function resolveSenateBioguideId(
  lastName: string,
  state: string,
  party: string,
  lisMemberId: string,
  lookup?: Map<string, string>
): string {
  const partyCode = normalizePartyCode(party);
  if (partyCode === "Other") return lisMemberId ? `LIS:${lisMemberId}` : "";
  const key = senateMemberLookupKey(lastName, state, partyCode);
  const bioguide = lookup?.get(key);
  if (bioguide) return bioguide;
  return lisMemberId ? `LIS:${lisMemberId}` : "";
}

export function parseSenateMemberVoteXml(
  xml: string,
  congress: number,
  session: number,
  rollNumber: number,
  options?: { senateBioguideLookup?: Map<string, string> }
): { members: MemberRecord[]; votes: MemberVoteRecord[] } {
  const members: MemberRecord[] = [];
  const votes: MemberVoteRecord[] = [];
  const blocks = xml.match(/<member>[\s\S]*?<\/member>/gi) ?? [];

  for (const block of blocks) {
    const lisId = getTag(block, "lis_member_id");
    const first = getTag(block, "first_name");
    const last = getTag(block, "last_name");
    // Prefer First Last — member_full is often "Last (P-ST)" / "Last, First (P-ST)",
    // which breaks last-name lookup if upserted over clean roster names.
    const nameFromParts = [first, last].filter(Boolean).join(" ");
    const name = nameFromParts || getTag(block, "member_full");
    const party = getTag(block, "party");
    const state = getTag(block, "state");
    const position = getTag(block, "vote_cast");
    if (!position || !last) continue;

    const id = resolveSenateBioguideId(last, state, party, lisId, options?.senateBioguideLookup);
    if (!id) continue;

    members.push({
      bioguideId: id,
      name,
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
  rollNumber: number,
  options?: { senateBioguideLookup?: Map<string, string> }
): Promise<{ members: MemberRecord[]; votes: MemberVoteRecord[] }> {
  const padded = String(rollNumber).padStart(5, "0");
  const url = `https://www.senate.gov/legislative/LIS/roll_call_votes/vote${congress}${session}/vote_${congress}_${session}_${padded}.xml`;
  const xml = await fetchSenateLegislativeText(url, { browser: env.BROWSER });
  return parseSenateMemberVoteXml(xml, congress, session, rollNumber, options);
}

export async function fetchSenateMemberVotesForEnv(
  env: Env,
  rollNumber: number
): Promise<{ members: MemberRecord[]; votes: MemberVoteRecord[] }> {
  return fetchSenateMemberVotes(env, congressNumber(env), sessionNumber(env), rollNumber);
}
