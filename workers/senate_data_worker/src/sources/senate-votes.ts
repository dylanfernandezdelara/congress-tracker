import type { Env } from "../config";
import { congressNumber, sessionNumber } from "../config";
import type {
  ConfirmationVote,
  IngestVotesResult,
  NonPassageVoteStub,
  PassageVote,
} from "../types";
import { voteKey } from "../vote-key";
import { parseSenateIssue } from "./bill-ref";
import { isConfirmationVote } from "./confirmation";
import { parseSenateNominationIssue } from "./nomination-ref";
import { fetchSenateLegislativeText } from "./senate-fetch";
import { getTag } from "./senate-xml";
import { isPassageVote } from "./passage";
import { ensureSchema } from "../d1/schema";

const SENATE_VOTE_MENU_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function senateVoteMenuCacheKey(congress: number, session: number): string {
  return `senate_vote_menu_cache_${congress}_${session}`;
}

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

async function writeSenateVoteMenuCache(
  db: D1Database,
  congress: number,
  session: number,
  xml: string
): Promise<void> {
  await ensureSchema(db);
  const fetchedAt = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO pipeline_state (key, value_json, updated_at)
       VALUES (?1, ?2, ?3)
       ON CONFLICT(key) DO UPDATE SET
         value_json = excluded.value_json,
         updated_at = excluded.updated_at`
    )
    .bind(
      senateVoteMenuCacheKey(congress, session),
      JSON.stringify({ fetched_at: fetchedAt, xml }),
      fetchedAt
    )
    .run();
}

async function fetchSenateVoteMenuXml(
  env: Env,
  congress: number,
  session: number
): Promise<{ xml: string; warnings: string[] }> {
  const url = `https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_${congress}_${session}.xml`;
  try {
    const xml = await fetchSenateLegislativeText(url);
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
    const cached = await readSenateVoteMenuCache(env.DB, congress, session);
    if (cached) {
      const message = err instanceof Error ? err.message : String(err);
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
    throw err;
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
    const question = getTag(block, "question");
    const title = getTag(block, "title");

    const issue = getTag(block, "issue");
    const nomination = parseSenateNominationIssue(issue, congress);
    if (nomination) {
      const voteNumber = Number.parseInt(getTag(block, "vote_number"), 10);
      if (Number.isNaN(voteNumber)) continue;

      const confirmationQuestion = (question.trim() || title).replace(/\s+/g, " ").trim();
      if (!confirmationQuestion || !isConfirmationVote(confirmationQuestion)) {
        continue;
      }

      const yeas = Number.parseInt(getTag(block, "yeas"), 10) || 0;
      const nays = Number.parseInt(getTag(block, "nays"), 10) || 0;
      const tallyBlock = block.match(/<vote_tally>[\s\S]*?<\/vote_tally>/i)?.[0] ?? block;
      const yeasT = Number.parseInt(getTag(tallyBlock, "yeas"), 10) || yeas;
      const naysT = Number.parseInt(getTag(tallyBlock, "nays"), 10) || nays;
      const voteDate = parseSenateVoteDate(getTag(block, "vote_date"), congressYear, now);
      const result = getTag(block, "result");

      confirmationVotes.push({
        chamber: "Senate",
        congress,
        session,
        rollNumber: voteNumber,
        nomination,
        question: confirmationQuestion,
        result,
        yeas: yeasT,
        nays: naysT,
        voteDate,
      });
      continue;
    }

    const bill = parseSenateIssue(issue, congress);
    if (!bill) continue;

    const voteNumber = Number.parseInt(getTag(block, "vote_number"), 10);
    if (Number.isNaN(voteNumber)) continue;

    const yeas = Number.parseInt(getTag(block, "yeas"), 10) || 0;
    const nays = Number.parseInt(getTag(block, "nays"), 10) || 0;
    const tallyBlock = block.match(/<vote_tally>[\s\S]*?<\/vote_tally>/i)?.[0] ?? block;
    const yeasT = Number.parseInt(getTag(tallyBlock, "yeas"), 10) || yeas;
    const naysT = Number.parseInt(getTag(tallyBlock, "nays"), 10) || nays;
    const voteDate = parseSenateVoteDate(getTag(block, "vote_date"), congressYear, now);
    const result = getTag(block, "result");

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
          yeas: yeasT,
          nays: naysT,
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
      yeas: yeasT,
      nays: naysT,
      voteDate,
    });
  }

  return { votes, nonPassageStubs, confirmationVotes };
}

export async function ingestSenatePassageVotes(
  env: Env,
  lookbackStart: string | null,
  knownKeys: ReadonlySet<string> = new Set()
): Promise<IngestVotesResult> {
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

  const confirmationVotes: ConfirmationVote[] = [];
  for (const vote of parsed.confirmationVotes) {
    if (lookbackStart && vote.voteDate < lookbackStart) continue;
    if (knownKeys.has(voteKey(vote))) continue;
    confirmationVotes.push(vote);
  }

  return {
    votes,
    skipped,
    warnings: warnings.length > 0 ? warnings : undefined,
    nonPassageStubs: nonPassageStubs.length > 0 ? nonPassageStubs : undefined,
    confirmationVotes: confirmationVotes.length > 0 ? confirmationVotes : undefined,
  };
}
