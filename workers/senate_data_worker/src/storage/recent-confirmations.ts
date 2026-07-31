import {
  buildOfficialConfirmationAbout,
  confirmationHeadline,
  isThinConfirmationBackground,
} from "../../../../shared/confirmation-about";
import type { RollPartySplit } from "../../../../shared/stats-api-types";
import { isLocalSampleMemberId } from "../../../../shared/member-id";
import { VOTE_LOOKBACK_DAYS } from "../constants";
import type { Env } from "../config";
import {
  parseNomineesJson,
  parseStoredBackground,
} from "../d1/nominations";
import { selectRecentConfirmationVotes } from "../d1/confirmation-votes";
import { selectMemberVotesForRollKeys } from "../d1/member-votes";
import { hasRealMemberRoster } from "../d1/members";
import { isConfirmedResult } from "../sources/confirmation";
import {
  congressGovNominationUrl,
  parseNominationDescription,
} from "../sources/nomination-client";
import { nominationCitation } from "../sources/nomination-ref";
import { lookbackStartIso } from "../sources/congress-client";
import { rollPartySplits } from "../analytics/roll-party-stats";
import type {
  RecentConfirmationItem,
  RecentConfirmationsResponse,
} from "../../../../shared/confirmations-api-types";

export type { RecentConfirmationItem, RecentConfirmationsResponse };

function rollKey(
  congress: number,
  session: number,
  chamber: string,
  rollNumber: number
): string {
  return `${congress}:${session}:${chamber}:${rollNumber}`;
}

async function loadPartySplitsByRoll(
  db: D1Database,
  rows: Array<{
    congress: number;
    session: number;
    chamber: string;
    roll_number: number;
  }>
): Promise<Map<string, RollPartySplit[]>> {
  const out = new Map<string, RollPartySplit[]>();
  if (rows.length === 0) return out;

  const excludeLocalSample = await hasRealMemberRoster(db);
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.congress}:${row.session}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  for (const group of groups.values()) {
    const first = group[0]!;
    const voteRows = await selectMemberVotesForRollKeys(
      db,
      first.congress,
      first.session,
      group.map((row) => ({ chamber: row.chamber, roll_number: row.roll_number }))
    );
    const byRoll = new Map<string, Array<{ party: string | null; position: string }>>();
    for (const vote of voteRows) {
      if (excludeLocalSample && isLocalSampleMemberId(vote.bioguide_id)) continue;
      const key = rollKey(vote.congress, vote.session, vote.chamber, vote.roll_number);
      const list = byRoll.get(key) ?? [];
      list.push({ party: vote.party, position: vote.position });
      byRoll.set(key, list);
    }
    for (const [key, positions] of byRoll) {
      out.set(key, rollPartySplits(positions));
    }
  }
  return out;
}

export async function buildRecentConfirmations(
  env: Env,
  congress: number,
  session: number,
  limit: number,
  asOf: string = new Date().toISOString()
): Promise<RecentConfirmationsResponse> {
  const lookback = lookbackStartIso(VOTE_LOOKBACK_DAYS);
  const rows = (await selectRecentConfirmationVotes(env.DB, lookback, limit))
    .filter((row) => isConfirmedResult(row.result))
    .slice(0, limit);

  const partySplitsByRoll = await loadPartySplitsByRoll(env.DB, rows);

  const confirmations: RecentConfirmationItem[] = rows.map((row) => {
    const background = parseStoredBackground(row.background_json);
    const storedNominees = parseNomineesJson(row.nominees_json);
    const fromDescription =
      storedNominees.length === 0
        ? parseNominationDescription(row.description)
        : null;
    const nominees =
      storedNominees.length > 0
        ? storedNominees
        : (fromDescription?.nominees ?? []);
    const positionTitle =
      row.position_title?.trim() || fromDescription?.positionTitle || null;
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
      background?.what_was_confirmed?.trim() &&
      !isThinConfirmationBackground(
        background.what_was_confirmed,
        row.description
      )
        ? background.what_was_confirmed.trim()
        : positionTitle
          ? `The Senate confirmed the nomination for ${positionTitle}.`
          : row.description?.trim() || null;

    const storedAbout = background?.background?.trim() || null;
    const officialAbout =
      (storedAbout &&
      !isThinConfirmationBackground(storedAbout, row.description)
        ? storedAbout
        : null) ||
      buildOfficialConfirmationAbout({
        nominees,
        positionTitle,
        organization: row.organization,
        description: row.description,
      });

    const storedHeadline =
      background?.headline?.trim() &&
      !isThinConfirmationBackground(background.headline, row.description)
        ? background.headline.trim()
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
      position_title: positionTitle,
      organization: row.organization,
      description: row.description,
      question: row.question,
      result: row.result,
      yeas: row.yeas,
      nays: row.nays,
      vote_date: row.vote_date,
      headline: confirmationHeadline({
        storedHeadline,
        nominees,
        positionTitle,
        description: row.description,
        citation,
      }),
      what_was_confirmed: whatWasConfirmed,
      background: officialAbout,
      key_points: background?.key_points ?? [],
      congress_gov_url: congressGovNominationUrl(ref),
      wikipedia_url: background?.wikipedia_url ?? null,
      wikipedia_extract: background?.wikipedia_extract ?? null,
      party_splits:
        partySplitsByRoll.get(
          rollKey(row.congress, row.session, row.chamber, row.roll_number)
        ) ?? [],
    };
  });

  return {
    congress,
    session,
    confirmations,
    as_of: asOf,
  };
}
