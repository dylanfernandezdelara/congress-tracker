import type { Env } from "../config";
import { congressNumber, sessionNumber } from "../config";
import type { IngestVotesResult, PassageVote } from "../types";
import { voteKey } from "../vote-key";
import { parseSenateIssue } from "./bill-ref";
import { fetchText } from "./http";
import { isPassageVote } from "./passage";

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

function getTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : "";
}

export function parseSenateVoteMenuXml(xml: string, congress: number, session: number): PassageVote[] {
  const congressYear = getTag(xml, "congress_year") || String(new Date().getUTCFullYear());
  const votes: PassageVote[] = [];
  const blocks = xml.match(/<vote>[\s\S]*?<\/vote>/gi) ?? [];

  for (const block of blocks) {
    const question = getTag(block, "question");
    if (!isPassageVote(question)) continue;

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

    votes.push({
      chamber: "Senate",
      congress,
      session,
      rollNumber: voteNumber,
      bill,
      question: question.replace(/\s+/g, " ").trim(),
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
  const url = `https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_${congress}_${session}.xml`;
  const xml = await fetchText(url);
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
