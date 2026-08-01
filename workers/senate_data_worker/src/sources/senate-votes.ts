import type { Env } from "../config";
import { congressNumber, sessionNumber } from "../config";
import type {
  ConfirmationVote,
  NonPassageVoteStub,
  PassageVote,
  SenateIngestVotesResult,
} from "../types";
import { voteKey } from "../vote-key";
import { parseSenateIssue } from "./bill-ref";
import { isConfirmationVote } from "./confirmation";
import { parseSenateNominationIssue } from "./nomination-ref";
import { fetchSenateLegislativeText } from "./senate-fetch";
import { getTag } from "./senate-xml";
import { isPassageVote } from "./passage";
import { ensureSchema } from "../d1/schema";
import {
  encodeSenateVoteMenuCacheValue,
  isSenateVoteMenuXml,
  SENATE_VOTE_MENU_CACHE_UPSERT_SQL,
  senateVoteMenuCacheKey,
  senateVoteMenuUrl,
} from "../../../../shared/senate-vote-menu.mjs";

export { isSenateVoteMenuXml, senateVoteMenuCacheKey, senateVoteMenuUrl };

/** Shared fields every Senate menu `<vote>` block carries for stored rolls. */
function parseMenuVoteFields(
  block: string,
  congressYear: string,
  now: Date
): {
  voteNumber: number;
  yeas: number;
  nays: number;
  voteDate: string;
  result: string;
  question: string;
  title: string;
} | null {
  const voteNumber = Number.parseInt(getTag(block, "vote_number"), 10);
  if (Number.isNaN(voteNumber)) return null;

  const question = getTag(block, "question");
  const title = getTag(block, "title");
  const yeas = Number.parseInt(getTag(block, "yeas"), 10) || 0;
  const nays = Number.parseInt(getTag(block, "nays"), 10) || 0;
  const tallyBlock = block.match(/<vote_tally>[\s\S]*?<\/vote_tally>/i)?.[0] ?? block;
  const yeasT = Number.parseInt(getTag(tallyBlock, "yeas"), 10) || yeas;
  const naysT = Number.parseInt(getTag(tallyBlock, "nays"), 10) || nays;
  const voteDate = parseSenateVoteDate(getTag(block, "vote_date"), congressYear, now);
  const result = getTag(block, "result");

  return {
    voteNumber,
    yeas: yeasT,
    nays: naysT,
    voteDate,
    result,
    question,
    title,
  };
}

const SENATE_VOTE_MENU_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

async function readSenateVoteMenuCache(
  db: D1Database,
  congress: number,
  session: number
): Promise<string | null> {
  await ensureSchema(db);
  const row = await db
    .prepare(`SELECT value_json FROM pipeline_state WHERE key = ?1`)
    .bind(senateVoteMenuCacheKey(congress, session))
    .first<{ value_json: string }>();
  if (!row?.value_json) return null;
  try {
    const parsed = JSON.parse(row.value_json) as { fetched_at: string; xml: string };
    if (!parsed.xml || !parsed.fetched_at) return null;
    const ageMs = Date.now() - Date.parse(parsed.fetched_at);
    if (ageMs > SENATE_VOTE_MENU_CACHE_MAX_AGE_MS) return null;
    return parsed.xml;
  } catch {
    return null;
  }
}

/**
 * Persist a Senate LIS vote-menu XML blob for 403 fallback (and admin refresh).
 * Returns the `fetched_at` timestamp written to D1.
 */
export async function writeSenateVoteMenuCache(
  db: D1Database,
  congress: number,
  session: number,
  xml: string,
  fetchedAt: string = new Date().toISOString()
): Promise<string> {
  await ensureSchema(db);
  const encoded = encodeSenateVoteMenuCacheValue(xml, fetchedAt);
  await db
    .prepare(SENATE_VOTE_MENU_CACHE_UPSERT_SQL)
    .bind(
      senateVoteMenuCacheKey(congress, session),
      encoded.valueJson,
      encoded.fetchedAt
    )
    .run();
  return encoded.fetchedAt;
}

async function serveSenateVoteMenuFromCache(
  env: Env,
  congress: number,
  session: number,
  error: unknown
): Promise<{ xml: string; warnings: string[] }> {
  const cached = await readSenateVoteMenuCache(env.DB, congress, session);
  if (!cached) {
    throw error instanceof Error ? error : new Error(String(error));
  }
  const message = error instanceof Error ? error.message : String(error);
  const warning = `Senate vote menu served from D1 cache after live fetch failed: ${message}`;
  console.warn(
    JSON.stringify({
      event: "senate_vote_menu_cache_fallback",
      congress,
      session,
      error: message,
    })
  );
  return { xml: cached, warnings: [warning] };
}

async function fetchSenateVoteMenuXml(
  env: Env,
  congress: number,
  session: number
): Promise<{ xml: string; warnings: string[] }> {
  const url = senateVoteMenuUrl(congress, session);
  try {
    const xml = await fetchSenateLegislativeText(url);
    if (!isSenateVoteMenuXml(xml, { congress, session })) {
      return serveSenateVoteMenuFromCache(
        env,
        congress,
        session,
        new Error(`Live Senate vote menu failed structural validation for ${url}`)
      );
    }
    try {
      await writeSenateVoteMenuCache(env.DB, congress, session, xml);
    } catch (writeErr: unknown) {
      const message = writeErr instanceof Error ? writeErr.message : String(writeErr);
      console.warn(
        JSON.stringify({
          event: "senate_vote_menu_cache_write_failed",
          congress,
          session,
          error: message,
        })
      );
    }
    return { xml, warnings: [] };
  } catch (err: unknown) {
    return serveSenateVoteMenuFromCache(env, congress, session, err);
  }
}

const MONTHS: Record<string, string> = {
  Jan: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  May: "05",
  Jun: "06",
  Jul: "07",
  Aug: "08",
  Sep: "09",
  Oct: "10",
  Nov: "11",
  Dec: "12",
};

/** Allow a few days of clock/source skew before treating a date as "future". */
const FUTURE_DATE_SLACK_DAYS = 5;
/** Nov/Dec only — year-boundary menus mis-stamp late-session votes, not mid-year ones. */
const YEAR_BOUNDARY_ROLLBACK_MIN_MONTH = 11;

/**
 * Parse Senate menu `DD-Mon` stamps against the menu's `congress_year`.
 *
 * Year-boundary heuristic: a session menu can carry the new calendar year's
 * `congress_year` while still listing late-year votes as `DD-Nov`/`DD-Dec`. If
 * the assembled Nov/Dec date is more than {@link FUTURE_DATE_SLACK_DAYS} after
 * `now`, roll the year back by one.
 */
export function parseSenateVoteDate(
  voteDate: string,
  congressYear: string,
  now: Date = new Date()
): string {
  const m = voteDate.trim().match(/^(\d{1,2})-([A-Za-z]{3})$/);
  if (!m) return voteDate;
  const day = m[1].padStart(2, "0");
  const mon = MONTHS[m[2]] ?? "01";
  let year = Number.parseInt(congressYear, 10);
  if (!Number.isFinite(year)) {
    return `${congressYear}-${mon}-${day}`;
  }

  const monthNum = Number.parseInt(mon, 10);
  const candidateUtc = Date.UTC(year, monthNum - 1, Number.parseInt(day, 10));
  const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const slackMs = FUTURE_DATE_SLACK_DAYS * 24 * 60 * 60 * 1000;
  if (
    monthNum >= YEAR_BOUNDARY_ROLLBACK_MIN_MONTH &&
    candidateUtc - nowUtc > slackMs
  ) {
    year -= 1;
  }

  return `${year}-${mon}-${day}`;
}

export interface ParsedSenateVoteMenu {
  votes: PassageVote[];
  nonPassageStubs: NonPassageVoteStub[];
  confirmationVotes: ConfirmationVote[];
}

/**
 * Parse the session vote menu into passage votes, non-passage companion rolls
 * (cloture, amendments, motions), and nomination confirmation rolls. The menu
 * already carries question, result, and tally for every roll, so companion and
 * confirmation votes cost no extra request.
 */
export function parseSenateVoteMenuXml(
  xml: string,
  congress: number,
  session: number,
  now: Date = new Date()
): ParsedSenateVoteMenu {
  const congressYear = getTag(xml, "congress_year") || String(now.getUTCFullYear());
  const votes: PassageVote[] = [];
  const nonPassageStubs: NonPassageVoteStub[] = [];
  const confirmationVotes: ConfirmationVote[] = [];
  const blocks = xml.match(/<vote>[\s\S]*?<\/vote>/gi) ?? [];

  for (const block of blocks) {
    // En-bloc nomination rolls nest many <matter> issues under one roll call.
    // Current confirmation_votes PK is one row per roll, so ingesting the first
    // <issue> would mis-attribute the shared tally. Skip until multi-nominee
    // storage exists.
    if (/<en_bloc[\s>]/i.test(block)) continue;

    const fields = parseMenuVoteFields(block, congressYear, now);
    if (!fields) continue;

    const { voteNumber, yeas, nays, voteDate, result, question, title } = fields;
    const issue = getTag(block, "issue");
    const nomination = parseSenateNominationIssue(issue, congress);
    if (nomination) {
      const confirmationQuestion = (question.trim() || title).replace(/\s+/g, " ").trim();
      if (!confirmationQuestion || !isConfirmationVote(confirmationQuestion)) {
        continue;
      }

      confirmationVotes.push({
        chamber: "Senate",
        congress,
        session,
        rollNumber: voteNumber,
        nomination,
        question: confirmationQuestion,
        result,
        yeas,
        nays,
        voteDate,
      });
      continue;
    }

    const bill = parseSenateIssue(issue, congress);
    if (!bill) continue;

    if (!isPassageVote(question) && !isPassageVote(title)) {
      // Some rolls carry only a title. Storing an empty question would make the
      // row look unfilled forever: it is re-fetched by every run and never
      // shown as a companion vote.
      const stubQuestion = (question.trim() || title).replace(/\s+/g, " ").trim();
      if (stubQuestion) {
        nonPassageStubs.push({
          chamber: "Senate",
          congress,
          session,
          rollNumber: voteNumber,
          bill,
          question: stubQuestion,
          result,
          yeas,
          nays,
          voteDate,
        });
      }
      continue;
    }

    const displayQuestion = isPassageVote(title) ? title.split(";")[0]!.trim() : question;

    votes.push({
      chamber: "Senate",
      congress,
      session,
      rollNumber: voteNumber,
      bill,
      question: displayQuestion.replace(/\s+/g, " ").trim(),
      result,
      yeas,
      nays,
      voteDate,
    });
  }

  return { votes, nonPassageStubs, confirmationVotes };
}

export async function ingestSenatePassageVotes(
  env: Env,
  lookbackStart: string | null,
  knownKeys: ReadonlySet<string> = new Set()
): Promise<SenateIngestVotesResult> {
  const congress = congressNumber(env);
  const session = sessionNumber(env);
  const { xml, warnings } = await fetchSenateVoteMenuXml(env, congress, session);
  const parsed = parseSenateVoteMenuXml(xml, congress, session);

  const votes: PassageVote[] = [];
  let skipped = 0;
  for (const vote of parsed.votes) {
    if (lookbackStart && vote.voteDate < lookbackStart) continue;
    if (knownKeys.has(voteKey(vote))) {
      skipped += 1;
      continue;
    }
    votes.push(vote);
  }

  const nonPassageStubs: NonPassageVoteStub[] = [];
  for (const stub of parsed.nonPassageStubs) {
    if (lookbackStart && stub.voteDate < lookbackStart) continue;
    if (knownKeys.has(voteKey(stub))) continue;
    nonPassageStubs.push(stub);
  }

  // Confirmations are upserted idempotently; do not share knownKeys with
  // passage/companion roll skip state.
  const confirmationVotes: ConfirmationVote[] = [];
  for (const vote of parsed.confirmationVotes) {
    if (lookbackStart && vote.voteDate < lookbackStart) continue;
    confirmationVotes.push(vote);
  }

  return {
    votes,
    skipped,
    warnings: warnings.length > 0 ? warnings : undefined,
    nonPassageStubs: nonPassageStubs.length > 0 ? nonPassageStubs : undefined,
    confirmationVotes,
  };
}
