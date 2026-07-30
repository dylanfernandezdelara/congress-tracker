import { buildOfficialConfirmationAbout } from "../../../../shared/confirmation-about";
import type { RollPartySplit } from "../../../../shared/stats-api-types";
import { VOTE_LOOKBACK_DAYS } from "../constants";
import type { Env } from "../config";
import {
  parseNomineesJson,
  parseStoredBackground,
} from "../d1/nominations";
import { selectRecentConfirmationVotes } from "../d1/confirmation-votes";
import { selectMemberVotesForRollKeys } from "../d1/member-votes";
import { isLocalSampleMemberId } from "../../../../shared/member-id";
import { hasRealMemberRoster } from "../d1/members";
import { isConfirmedResult } from "../sources/confirmation";
import { congressGovNominationUrl } from "../sources/nomination-client";
import { nominationCitation } from "../sources/nomination-ref";
import { lookbackStartIso } from "../sources/congress-client";
import { rollPartySplits } from "../analytics/roll-party-stats";
import type {
  RecentConfirmationItem,
  RecentConfirmationsResponse,
} from "../../../../shared/confirmations-api-types";

export type { RecentConfirmationItem, RecentConfirmationsResponse };

function displayHeadline(item: {
  backgroundHeadline: string | null;
  nominees: { display_name: string }[];
  positionTitle: string | null;
  citation: string;
  description: string | null;
}): string | null {
  if (item.backgroundHeadline?.trim()) return item.backgroundHeadline.trim();
  const name = item.nominees[0]?.display_name?.trim();
  if (name && item.positionTitle?.trim()) {
    return `${name} confirmed as ${item.positionTitle.trim()}`;
  }
  if (name) return `${name} confirmed`;
  if (item.description?.trim()) return item.description.trim();
  return item.citation;
}

function rollKey(chamber: string, rollNumber: number): string {
  return `${chamber}:${rollNumber}`;
}

export async function buildRecentConfirmations(
  env: Env,
  congress: number,
  session: number,
  limit: number,
  asOf: string = new Date().toISOString()
): Promise<RecentConfirmationsResponse> {
  const lookback = lookbackStartIso(VOTE_LOOKBACK_DAYS);
  const rows = (await selectRecentConfirmationVotes(env.DB, lookback, limit)).filter((row) =>
    isConfirmedResult(row.result)
  ).slice(0, limit);

  const partySplitsByRoll = new Map<string, RollPartySplit[]>();
  if (rows.length > 0) {
    const voteRows = await selectMemberVotesForRollKeys(
      env.DB,
      congress,
      session,
      rows.map((row) => ({ chamber: row.chamber, roll_number: row.roll_number }))
    );
    const excludeLocalSample = await hasRealMemberRoster(env.DB);
    const byRoll = new Map<string, Array<{ party: string | null; position: string }>>();
    for (const vote of voteRows) {
      if (excludeLocalSample && isLocalSampleMemberId(vote.bioguide_id)) continue;
      const key = rollKey(vote.chamber, vote.roll_number);
      const list = byRoll.get(key) ?? [];
      list.push({ party: vote.party, position: vote.position });
      byRoll.set(key, list);
    }
    for (const [key, positions] of byRoll) {
      partySplitsByRoll.set(key, rollPartySplits(positions));
    }
  }

  const confirmations: RecentConfirmationItem[] = rows.map((row) => {
    const background = parseStoredBackground(row.background_json);
    const nominees = parseNomineesJson(row.nominees_json);
    const citation =
      row.citation?.trim() ||
      nominationCitation({
        number: row.nomination_number,
        partNumber: row.part_number,
      });
    const ref = {
      congress: row.nomination_congress,
      number: row.nomination_number,
      partNumber: row.part_number,
    };

    const whatWasConfirmed =
      background?.what_was_confirmed?.trim() ||
      (row.position_title?.trim()
        ? `The Senate confirmed the nomination for ${row.position_title.trim()}.`
        : row.description?.trim() || null);

    // Official rewrite, else honest Congress.gov identity fallback.
    // Wikipedia person extracts are preferred in the UI (see selectConfirmationAbout).
    const officialAbout =
      background?.background?.trim() ||
      buildOfficialConfirmationAbout({
        nominees,
        positionTitle: row.position_title,
        organization: row.organization,
        description: row.description,
      });
    const wikipediaUrl =
      typeof background?.wikipedia_url === "string" && background.wikipedia_url.trim()
        ? background.wikipedia_url.trim()
        : null;
    const wikipediaExtract =
      typeof background?.wikipedia_extract === "string" &&
      background.wikipedia_extract.trim()
        ? background.wikipedia_extract.trim()
        : null;

    return {
      chamber: "Senate",
      congress: row.congress,
      session: row.session,
      roll_number: row.roll_number,
      citation,
      nomination_number: row.nomination_number,
      part_number: row.part_number,
      nominee_names: nominees,
      position_title: row.position_title,
      organization: row.organization,
      description: row.description,
      question: row.question,
      result: row.result,
      yeas: row.yeas,
      nays: row.nays,
      vote_date: row.vote_date,
      headline: displayHeadline({
        backgroundHeadline: background?.headline ?? null,
        nominees,
        positionTitle: row.position_title,
        citation,
        description: row.description,
      }),
      what_was_confirmed: whatWasConfirmed,
      background: officialAbout,
      key_points: background?.key_points ?? [],
      congress_gov_url: congressGovNominationUrl(ref),
      wikipedia_url: wikipediaUrl,
      wikipedia_extract: wikipediaExtract,
      party_splits: partySplitsByRoll.get(rollKey(row.chamber, row.roll_number)) ?? [],
    };
  });

  return {
    congress,
    session,
    confirmations,
    as_of: asOf,
  };
}
