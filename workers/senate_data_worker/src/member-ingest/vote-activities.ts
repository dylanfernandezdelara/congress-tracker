/**
 * Senate roll call vote activity fetching for member ingestion.
 */

import {
  buildVoteDetailUrl,
  fetchVoteDetailsParallel,
  fetchVoteMenu,
  type FetchConfig,
} from "../fetch";
import type { MemberIndexEntry, SourceError, RollCallVoteItem } from "../types";
import { parseVoteDetailXml, parseVoteMenuXml, type VoteSummary } from "../xml";
import {
  isDateInRange,
  buildMembersByState,
  matchMemberForVote,
  extractBillRefFromVote,
  normalizeVoteCast,
  computePartyMajorityByParty,
} from "./helpers";
import { normalizePartyCode } from "../domain/party-majority";

type VoteActivitiesByMember = Map<string, RollCallVoteItem[]>;

export async function fetchVoteActivities(
  members: MemberIndexEntry[],
  congress: number,
  session: number,
  windowStart: string,
  windowEnd: string,
  fetchConfig: FetchConfig,
  errors: SourceError[],
  menuVotes?: VoteSummary[] | null
): Promise<VoteActivitiesByMember> {
  const voteActivitiesByMember: VoteActivitiesByMember = new Map();
  let allVotes: VoteSummary[] | undefined;
  if (menuVotes === null) {
    errors.push({
      source: "senate",
      message: "Vote menu unavailable (fetch already attempted upstream)",
    });
    return voteActivitiesByMember;
  }
  if (menuVotes !== undefined) {
    allVotes = menuVotes;
  } else {
    const menuResult = await fetchVoteMenu(congress, session, fetchConfig);
    if (!menuResult.success || !menuResult.data) {
      errors.push({
        source: "senate",
        message: `Vote menu fetch failed: ${menuResult.error ?? "unknown error"}`,
      });
      return voteActivitiesByMember;
    }
    allVotes = parseVoteMenuXml(menuResult.data);
  }

  const targetVotes = allVotes.filter((vote) =>
    isDateInRange(vote.vote_date, windowStart, windowEnd)
  );

  if (targetVotes.length === 0) {
    return voteActivitiesByMember;
  }

  const voteNumbers = targetVotes.map((vote) => vote.vote_number);
  const detailsResult = await fetchVoteDetailsParallel(
    voteNumbers,
    congress,
    session,
    fetchConfig
  );

  const membersByState = buildMembersByState(members);
  for (const [voteNumber, result] of detailsResult.results.entries()) {
    if (!result.success || !result.data) {
      errors.push({
        source: "senate",
        message: `Vote detail ${voteNumber} fetch failed: ${result.error ?? "unknown error"}`,
      });
      continue;
    }
    const details = parseVoteDetailXml(result.data, congress, session);
    if (!details) {
      errors.push({
        source: "senate",
        message: `Vote detail ${voteNumber} parse failed`,
      });
      continue;
    }

    const bill = extractBillRefFromVote(details);
    const url = buildVoteDetailUrl(details.congress, details.session, details.vote_number);
    const partyMajorityByParty = computePartyMajorityByParty(details.member_votes);
    for (const vote of details.member_votes) {
      const member = matchMemberForVote(vote, membersByState);
      if (!member) continue;
      const normalizedParty = normalizePartyCode(vote.party);
      const normalizedVoteCast = normalizeVoteCast(vote.vote_cast);
      const partyMajorityVote = normalizedParty
        ? partyMajorityByParty.get(normalizedParty)
        : undefined;
      const againstPartyMajority =
        Boolean(partyMajorityVote) && partyMajorityVote !== normalizedVoteCast;
      const list = voteActivitiesByMember.get(member.bioguide_id) ?? [];
      list.push({
        source: "senate",
        type: "roll_call_vote",
        vote_number: details.vote_number,
        vote_date: details.vote_date,
        title: details.vote_title,
        question: details.vote_question,
        result: details.vote_result,
        vote_cast: vote.vote_cast,
        party: normalizedParty || undefined,
        party_majority_vote: partyMajorityVote,
        against_party_majority: againstPartyMajority,
        bill: bill ?? undefined,
        url,
      });
      voteActivitiesByMember.set(member.bioguide_id, list);
    }
  }

  return voteActivitiesByMember;
}
