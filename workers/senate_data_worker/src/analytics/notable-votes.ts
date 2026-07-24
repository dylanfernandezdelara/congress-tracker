import {
  formatBillDocket,
  proceduralHeadline,
  stripLocalSampleLabel,
  voteIndicatesFailure,
} from "../../../../shared/feed-content";
import { bioguidePhotoUrl } from "../../../../shared/member-photo";
import { isLocalSampleMemberId, isRealBioguideId } from "../../../../shared/member-id";
import {
  crossVoteLabel,
  isProceduralBillType,
  isProceduralNotableVote,
  notableVotesLookbackStartIso,
} from "../../../../shared/notable-votes";
import { normalizePartyCode } from "../../../../shared/party";
import { normalizeVotePosition } from "../../../../shared/vote-positions";
import type { Env } from "../config";
import { ensureSchema } from "../d1/schema";
import { hasRealMemberRoster } from "../d1/members";
import { selectMemberVotesForRollKeys } from "../d1/member-votes";
import { selectSessionCrossVoteCounts } from "../d1/member-session-stats";
import { computeRollDefectors } from "./defectors";
import { partyMajoritiesForRoll } from "./roll-party-stats";
import { synthesizeNotableVoteBlurb } from "../synthesis/notable-vote";
import type { NotableVotePromptContext } from "../synthesis/notable-vote-prompt";
import {
  getNotableVoteBlurb,
  upsertNotableVoteBlurb,
} from "../storage/notable-vote-blurbs";
import type { NotableVoteEntry, Chamber } from "../types";

interface CandidateRow {
  chamber: string;
  congress: number;
  session: number;
  roll_number: number;
  bill_type: string;
  bill_number: number;
  yeas: number;
  nays: number;
  margin: number;
  vote_date: string;
  result: string;
  question: string;
  headline: string | null;
  bill_title: string | null;
  digest_lead: string | null;
  raw_summary: string | null;
}

interface MemberPartyPositionRow {
  party: string | null;
  position: string;
}

interface SessionMemberVoteRow extends MemberPartyPositionRow {
  bioguide_id: string;
  chamber: string;
  congress: number;
  session: number;
  roll_number: number;
}

interface RollBreakStats {
  crossPartyBreaks: number;
  bipartisanYeas: boolean;
  minorityHelpedPass: boolean;
  chamberMajorityParty: string | null;
}

const EMPTY_BREAK_STATS: RollBreakStats = {
  crossPartyBreaks: 0,
  bipartisanYeas: false,
  minorityHelpedPass: false,
  chamberMajorityParty: null,
};

export interface BuildNotableVotesOptions {
  env?: Env;
  waitUntil?: (promise: Promise<unknown>) => void;
  /** UTC anchor for recency filtering (defaults to now). */
  asOf?: Date;
}

export interface BuildNotableVotesResult {
  notable: NotableVoteEntry[];
  detection_method: "heuristic" | "llm";
}

function rollKey(vote: Pick<CandidateRow, "chamber" | "congress" | "session" | "roll_number">): string {
  return `${vote.chamber}:${vote.congress}:${vote.session}:${vote.roll_number}`;
}

async function fetchCandidates(
  db: D1Database,
  congress: number,
  session: number,
  lookbackStart: string,
  limit: number
): Promise<CandidateRow[]> {
  const { results } = await db
    .prepare(
      `SELECT v.chamber, v.congress, v.session, v.roll_number,
              v.bill_type, v.bill_number, v.yeas, v.nays,
              ABS(v.yeas - v.nays) AS margin, v.vote_date, v.result, v.question,
              json_extract(d.digest_json, '$.headline') AS headline,
              json_extract(d.digest_json, '$.what_it_does') AS digest_lead,
              d.title AS bill_title,
              d.raw_summary_text AS raw_summary
       FROM votes v
       LEFT JOIN bill_digests d
         ON d.congress = v.bill_congress AND d.bill_type = v.bill_type AND d.number = v.bill_number
       WHERE v.congress = ? AND v.session = ? AND v.is_passage = 1
         AND v.vote_date >= ?
       ORDER BY v.vote_date DESC
       LIMIT ?`
    )
    .bind(congress, session, lookbackStart, limit)
    .all<CandidateRow>();

  return results ?? [];
}

async function fetchCandidateMemberVotesByRoll(
  db: D1Database,
  congress: number,
  session: number,
  candidates: CandidateRow[]
): Promise<Map<string, SessionMemberVoteRow[]>> {
  const rows = await selectMemberVotesForRollKeys(
    db,
    congress,
    session,
    candidates.map((vote) => ({
      chamber: vote.chamber,
      roll_number: vote.roll_number,
    }))
  );

  const byRoll = new Map<string, SessionMemberVoteRow[]>();
  for (const row of rows) {
    const key = rollKey(row);
    const list = byRoll.get(key) ?? [];
    list.push(row);
    byRoll.set(key, list);
  }
  return byRoll;
}

function computeRollBreakStats(positions: MemberPartyPositionRow[]): RollBreakStats | null {
  if (positions.length === 0) return null;

  const partyMajorities = partyMajoritiesForRoll(positions);
  let crossPartyBreaks = 0;
  const yeaByParty = new Map<string, number>();

  for (const { party, position } of positions) {
    const code = normalizePartyCode(party);
    if (code === "Other") continue;
    const norm = normalizeVotePosition(position);
    if (norm === "yea") {
      yeaByParty.set(code, (yeaByParty.get(code) ?? 0) + 1);
    }
    const majority = partyMajorities.get(code);
    if (!majority || norm === "other") continue;
    if (norm !== majority) crossPartyBreaks += 1;
  }

  const partyTotals = new Map<string, number>();
  for (const { party } of positions) {
    const code = normalizePartyCode(party);
    if (code === "Other") continue;
    partyTotals.set(code, (partyTotals.get(code) ?? 0) + 1);
  }

  let chamberMajorityParty: string | null = null;
  let topCount = 0;
  for (const [party, count] of partyTotals) {
    if (count > topCount) {
      topCount = count;
      chamberMajorityParty = party;
    }
  }

  const yeaParties = [...yeaByParty.entries()].filter(([, count]) => count >= 2);
  const bipartisanYeas = yeaParties.length >= 2;
  const minorityHelpedPass =
    chamberMajorityParty !== null &&
    yeaParties.some(([party]) => party !== chamberMajorityParty);

  return {
    crossPartyBreaks,
    bipartisanYeas,
    minorityHelpedPass,
    chamberMajorityParty,
  };
}

function scoreVote(vote: CandidateRow, stats: RollBreakStats | null): number {
  const breakStats = stats ?? EMPTY_BREAK_STATS;
  if (
    isProceduralNotableVote(vote.bill_type, vote.bill_title, {
      margin: vote.margin,
      crossPartyBreaks: breakStats.crossPartyBreaks,
    })
  ) {
    return 0;
  }

  let score = Math.max(0, 40 - vote.margin);
  score += Math.min(25, breakStats.crossPartyBreaks * 4);
  if (breakStats.bipartisanYeas) score += 15;
  if (breakStats.minorityHelpedPass) score += 20;
  if (vote.headline) score += 5;
  return score;
}

function buildWhyItMattersHeuristic(vote: CandidateRow, stats: RollBreakStats): string {
  const parts: string[] = [];
  const chamber = vote.chamber;
  const failed = voteIndicatesFailure(vote.result);
  const outcomeVerb = failed ? "Failed" : "Passed";

  if (vote.margin <= 5) {
    parts.push(
      `${outcomeVerb} in the ${chamber} by just ${vote.margin} vote${vote.margin === 1 ? "" : "s"}`
    );
  }

  if (stats.crossPartyBreaks >= 3) {
    parts.push(`${stats.crossPartyBreaks} members broke with their party`);
  } else if (stats.bipartisanYeas) {
    parts.push(
      failed ? "Bipartisan split on a close roll call" : "Bipartisan coalition carried the vote"
    );
  }

  if (!failed && stats.minorityHelpedPass && stats.chamberMajorityParty) {
    const minorityLabel =
      stats.chamberMajorityParty === "R"
        ? "Democrats"
        : stats.chamberMajorityParty === "D"
          ? "Republicans"
          : "The minority party";
    parts.push(`${minorityLabel} supplied critical support`);
  }

  if (parts.length === 0) {
    const outcome = failed ? "failed" : "passed";
    const billLabel = formatBillDocket(vote.bill_type, vote.bill_number, vote.congress);
    if (vote.headline) {
      return `${vote.headline} — ${chamber} ${outcome} ${vote.yeas}-${vote.nays}.`;
    }
    return `${billLabel} ${outcome} in the ${chamber} on a ${vote.yeas}-${vote.nays} roll call.`;
  }

  return parts.join(" · ");
}

function buildPromptContext(
  vote: CandidateRow,
  stats: RollBreakStats
): NotableVotePromptContext {
  return {
    billType: vote.bill_type,
    billNumber: vote.bill_number,
    congress: vote.congress,
    chamber: vote.chamber,
    voteDate: vote.vote_date,
    result: vote.result,
    yeas: vote.yeas,
    nays: vote.nays,
    margin: vote.margin,
    headline: vote.headline,
    billTitle: vote.bill_title,
    digestLead: vote.digest_lead,
    rawSummary: vote.raw_summary,
    crossPartyBreaks: stats.crossPartyBreaks,
    bipartisanYeas: stats.bipartisanYeas,
    minorityHelpedPass: stats.minorityHelpedPass,
    chamberMajorityParty: stats.chamberMajorityParty,
    isProcedural:
      isProceduralBillType(vote.bill_type) ||
      (vote.bill_title !== null && proceduralHeadline(vote.bill_title) !== null),
  };
}

export async function buildNotableVotes(
  db: D1Database,
  congress: number,
  session: number,
  limit = 3,
  options?: BuildNotableVotesOptions
): Promise<BuildNotableVotesResult> {
  await ensureSchema(db);
  const lookbackStart = notableVotesLookbackStartIso(options?.asOf ?? new Date());
  const candidates = await fetchCandidates(db, congress, session, lookbackStart, 60);
  const [memberVotesByRoll, crossVoteCounts] = await Promise.all([
    fetchCandidateMemberVotesByRoll(db, congress, session, candidates),
    selectSessionCrossVoteCounts(db, congress, session),
  ]);
  const excludeLocalSample = await hasRealMemberRoster(db);

  const scored: Array<{
    vote: CandidateRow;
    stats: RollBreakStats;
    significance_score: number;
  }> = [];

  for (const vote of candidates) {
    const rollRows = memberVotesByRoll.get(rollKey(vote)) ?? [];
    const stats = computeRollBreakStats(rollRows);
    const significance_score = scoreVote(vote, stats);
    if (significance_score < 15) continue;
    scored.push({ vote, stats: stats ?? EMPTY_BREAK_STATS, significance_score });
  }

  scored.sort(
    (a, b) =>
      b.significance_score - a.significance_score ||
      a.vote.margin - b.vote.margin ||
      b.vote.vote_date.localeCompare(a.vote.vote_date)
  );

  const top = scored.slice(0, limit);
  let usedLlm = false;

  const notable = await Promise.all(
    top.map(async ({ vote, stats, significance_score }) => {
    const roll = {
      chamber: vote.chamber,
      congress: vote.congress,
      session: vote.session,
      roll_number: vote.roll_number,
    };

    let why_it_matters = buildWhyItMattersHeuristic(vote, stats);

    const cached = await getNotableVoteBlurb(db, roll);
    if (cached) {
      why_it_matters = cached.why_it_matters;
      if (cached.detection_method === "llm") usedLlm = true;
    } else if (options?.env?.OPENROUTER_API_KEY?.trim()) {
      const promptContext = buildPromptContext(vote, stats);
      const warmBlurb = async () => {
        const llm = await synthesizeNotableVoteBlurb(options.env!, promptContext);
        if (!llm) return;
        await upsertNotableVoteBlurb(db, roll, {
          why_it_matters: llm.why_it_matters,
          detection_method: "llm",
        });
      };
      if (options.waitUntil) {
        options.waitUntil(warmBlurb());
      }
    }

    const rollResult = await computeRollDefectors(db, {
      chamber: vote.chamber as Chamber,
      congress: vote.congress,
      session: vote.session,
      roll_number: vote.roll_number,
    });
    const member_votes_available = rollResult.member_votes_available;

    const seen = new Set<string>();
    const defectors = rollResult.defectors
      .filter((defector) => !excludeLocalSample || !isLocalSampleMemberId(defector.bioguide_id))
      .filter((defector) => isRealBioguideId(defector.bioguide_id))
      .filter((defector) => {
        if (seen.has(defector.bioguide_id)) return false;
        seen.add(defector.bioguide_id);
        return true;
      })
      .map((defector) => {
        const cross_vote_count = crossVoteCounts.get(defector.bioguide_id) ?? 1;
        const cross_vote_label = crossVoteLabel(cross_vote_count);
        const photo = bioguidePhotoUrl(defector.bioguide_id);
        return {
          bioguide_id: defector.bioguide_id,
          name: defector.name,
          party: defector.party,
          state: defector.state,
          photo_url: photo ?? "",
          cross_vote_count,
          cross_vote_label,
        };
      })
      .sort(
        (a, b) =>
          a.cross_vote_count - b.cross_vote_count ||
          a.name.localeCompare(b.name)
      )
      .slice(0, 3);

    return {
      chamber: vote.chamber as Chamber,
      congress: vote.congress,
      session: vote.session,
      roll_number: vote.roll_number,
      bill_type: vote.bill_type,
      bill_number: vote.bill_number,
      yeas: vote.yeas,
      nays: vote.nays,
      margin: vote.margin,
      vote_date: vote.vote_date,
      headline: vote.headline ? stripLocalSampleLabel(vote.headline) : null,
      significance_score,
      why_it_matters,
      defectors,
      member_votes_available,
    };
    })
  );

  return {
    notable,
    detection_method: usedLlm ? "llm" : "heuristic",
  };
}
