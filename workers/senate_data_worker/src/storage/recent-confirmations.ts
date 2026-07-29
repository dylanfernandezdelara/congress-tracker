import { VOTE_LOOKBACK_DAYS } from "../constants";
import type { Env } from "../config";
import {
  parseNomineesJson,
  parseStoredBackground,
} from "../d1/nominations";
import { selectRecentConfirmationVotes } from "../d1/confirmation-votes";
import { congressGovNominationUrl } from "../sources/nomination-client";
import { nominationCitation } from "../sources/nomination-ref";
import { lookbackStartIso } from "../sources/congress-client";
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

export async function buildRecentConfirmations(
  env: Env,
  congress: number,
  session: number,
  limit: number,
  asOf: string = new Date().toISOString()
): Promise<RecentConfirmationsResponse> {
  const lookback = lookbackStartIso(VOTE_LOOKBACK_DAYS);
  const rows = await selectRecentConfirmationVotes(env.DB, lookback, limit);

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

    const backgroundText =
      background?.background?.trim() || row.raw_background_text?.trim() || row.description?.trim() || null;

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
      background: backgroundText,
      key_points: background?.key_points ?? [],
      congress_gov_url: congressGovNominationUrl(ref),
    };
  });

  return {
    congress,
    session,
    confirmations,
    as_of: asOf,
  };
}
