import type { Env } from "../config";
import { congressNumber, sessionNumber } from "../config";
import type { IngestVotesResult, PassageVote } from "../types";
import { voteKey } from "../vote-key";
import { parseSenateIssue } from "./bill-ref";
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

async function fetchSenateVoteMenuXml(env: Env, congress: number, session: number): Promise<string> {
  const url = `https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_${congress}_${session}.xml`;
  try {
    const xml = await fetchSenateLegislativeText(url);
    await writeSenateVoteMenuCache(env.DB, congress, session, xml);
    return xml;
  } catch (err: unknown) {
    const cached = await readSenateVoteMenuCache(env.DB, congress, session);
    if (cached) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        JSON.stringify({
          event: "senate_vote_menu_cache_fallback",
          congress,
          session,
          error: message,
        })
      );
      return cached;
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

function parseSenateVoteDate(voteDate: string, congressYear: string): string {
  const m = voteDate.trim().match(/^(\d{1,2})-([A-Za-z]{3})$/);
  if (!m) return voteDate;
  const day = m[1].padStart(2, "0");
  const mon = MONTHS[m[2]] ?? "01";
  return `${congressYear}-${mon}-${day}`;
}

export function parseSenateVoteMenuXml(xml: string, congress: number, session: number): PassageVote[] {
  const congressYear = getTag(xml, "congress_year") || String(new Date().getUTCFullYear());
  const votes: PassageVote[] = [];
  const blocks = xml.match(/<vote>[\s\S]*?<\/vote>/gi) ?? [];

  for (const block of blocks) {
    const question = getTag(block, "question");
    const title = getTag(block, "title");
    if (!isPassageVote(question) && !isPassageVote(title)) continue;

    const issue = getTag(block, "issue");
    const bill = parseSenateIssue(issue, congress);
    if (!bill) continue;

    const voteNumber = Number.parseInt(getTag(block, "vote_number"), 10);
    if (Number.isNaN(voteNumber)) continue;

    const yeas = Number.parseInt(getTag(block, "yeas"), 10) || 0;
    const nays = Number.parseInt(getTag(block, "nays"), 10) || 0;
    const tallyBlock = block.match(/<vote_tally>[\s\S]*?<\/vote_tally>/i)?.[0] ?? block;
    const yeasT = Number.parseInt(getTag(tallyBlock, "yeas"), 10) || yeas;
    const naysT = Number.parseInt(getTag(tallyBlock, "nays"), 10) || nays;

    const displayQuestion = isPassageVote(title) ? title.split(";")[0]!.trim() : question;

    votes.push({
      chamber: "Senate",
      congress,
      session,
      rollNumber: voteNumber,
      bill,
      question: displayQuestion.replace(/\s+/g, " ").trim(),
      result: getTag(block, "result"),
      yeas: yeasT,
      nays: naysT,
      voteDate: parseSenateVoteDate(getTag(block, "vote_date"), congressYear),
    });
  }

  return votes;
}

export async function ingestSenatePassageVotes(
  env: Env,
  lookbackStart: string | null,
  knownKeys: ReadonlySet<string> = new Set()
): Promise<IngestVotesResult> {
  const congress = congressNumber(env);
  const session = sessionNumber(env);
  const xml = await fetchSenateVoteMenuXml(env, congress, session);
  const all = parseSenateVoteMenuXml(xml, congress, session);

  const votes: PassageVote[] = [];
  let skipped = 0;
  for (const vote of all) {
    if (lookbackStart && vote.voteDate < lookbackStart) continue;
    if (knownKeys.has(voteKey(vote))) {
      skipped += 1;
      continue;
    }
    votes.push(vote);
  }

  return { votes, skipped };
}
