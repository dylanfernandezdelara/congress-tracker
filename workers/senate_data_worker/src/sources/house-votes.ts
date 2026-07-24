import type { Env } from "../config";
import { congressNumber, sessionNumber } from "../config";
import type { BillRef, IngestVotesResult, NonPassageVoteStub, PassageVote } from "../types";
import { voteKey } from "../vote-key";
import { parseHouseLegislation } from "./bill-ref";
import { normalizeBillType } from "./bill-type";
import { fetchJson, nextPageUrl } from "./http";
import { isPassageVote } from "./passage";

interface HouseVoteListItem {
  congress: number;
  rollCallNumber: number;
  sessionNumber: number;
  legislationNumber?: string;
  legislationType?: string;
  result: string;
  startDate: string;
}

interface HouseVoteListResponse {
  houseRollCallVotes?: HouseVoteListItem[];
  pagination?: { next?: string };
}

interface PartyTotal {
  yeaTotal?: number;
  nayTotal?: number;
}

interface HouseVoteDetail {
  congress: number;
  rollCallNumber: number;
  sessionNumber: number;
  legislationNumber?: string;
  legislationType?: string;
  result: string;
  startDate: string;
  voteQuestion?: string;
  voteTitle?: string;
  votePartyTotal?: PartyTotal[];
}

interface HouseVoteDetailResponse {
  houseRollCallVote?: HouseVoteDetail;
}

function sumTally(parties: PartyTotal[] | undefined): { yeas: number; nays: number } {
  let yeas = 0;
  let nays = 0;
  for (const p of parties ?? []) {
    yeas += p.yeaTotal ?? 0;
    nays += p.nayTotal ?? 0;
  }
  return { yeas, nays };
}

function voteDateFromIso(iso: string): string {
  return iso.slice(0, 10);
}

function withinLookback(isoDate: string, lookbackStart: string): boolean {
  return voteDateFromIso(isoDate) >= lookbackStart;
}

function newestVoteDateOnPage(items: HouseVoteListItem[]): string | null {
  if (items.length === 0) return null;
  let newest = voteDateFromIso(items[0]!.startDate);
  for (const item of items) {
    const date = voteDateFromIso(item.startDate);
    if (date > newest) newest = date;
  }
  return newest;
}

function pageEntirelyBeforeLookback(items: HouseVoteListItem[], lookbackStart: string): boolean {
  const newest = newestVoteDateOnPage(items);
  return newest !== null && newest < lookbackStart;
}

export async function ingestHousePassageVotes(
  env: Env,
  lookbackStart: string | null,
  knownKeys: ReadonlySet<string> = new Set(),
  maxNewVotes?: number
): Promise<IngestVotesResult> {
  const apiKey = env.CONGRESS_API_KEY;
  const congress = congressNumber(env);
  const session = sessionNumber(env);
  const out: PassageVote[] = [];
  const nonPassageStubs: NonPassageVoteStub[] = [];
  const seenThisRun = new Set<string>();
  let skipped = 0;
  let truncated = false;
  let nextUrl: string | null =
    `https://api.congress.gov/v3/house-vote/${congress}/${session}?format=json&limit=50&api_key=${apiKey}`;

  while (nextUrl) {
    const data: HouseVoteListResponse = await fetchJson<HouseVoteListResponse>(nextUrl);
    const items = data.houseRollCallVotes ?? [];

    for (const item of items) {
      if (lookbackStart && !withinLookback(item.startDate, lookbackStart)) continue;
      if (!item.legislationNumber || !item.legislationType) continue;

      const key = voteKey({
        chamber: "House",
        congress,
        session,
        rollNumber: item.rollCallNumber,
      });
      if (knownKeys.has(key) || seenThisRun.has(key)) {
        skipped += 1;
        continue;
      }

      const detailUrl = `https://api.congress.gov/v3/house-vote/${congress}/${session}/${item.rollCallNumber}?format=json&api_key=${apiKey}`;
      const detailRes = await fetchJson<HouseVoteDetailResponse>(detailUrl);
      const detail = detailRes.houseRollCallVote;
      // Missing/empty detail is transient — never stub, or we permanently skip
      // re-fetch via selectExistingVoteKeys (stubs are negative cache).
      if (!detail) continue;

      const questionText = detail.voteQuestion ?? "";
      const titleText = detail.voteTitle ?? "";
      if (!questionText.trim() && !titleText.trim()) continue;

      const bill = parseHouseLegislation(
        detail.legislationType ?? item.legislationType,
        detail.legislationNumber ?? item.legislationNumber,
        congress
      );
      if (!bill) continue;

      seenThisRun.add(key);

      if (!isPassageVote(questionText) && !isPassageVote(titleText)) {
        nonPassageStubs.push({
          chamber: "House",
          congress,
          session,
          rollNumber: item.rollCallNumber,
          bill,
          result: detail.result ?? item.result,
          voteDate: voteDateFromIso(detail.startDate ?? item.startDate),
        });
        continue;
      }

      const { yeas, nays } = sumTally(detail.votePartyTotal);
      const displayQuestion = isPassageVote(titleText)
        ? titleText.split(";")[0]!.trim()
        : questionText.trim();
      out.push({
        chamber: "House",
        congress,
        session,
        rollNumber: detail.rollCallNumber,
        bill,
        question: displayQuestion.replace(/\s+/g, " ").trim(),
        result: detail.result,
        yeas,
        nays,
        voteDate: voteDateFromIso(detail.startDate),
      });

      if (maxNewVotes !== undefined && out.length >= maxNewVotes) {
        truncated = true;
        break;
      }
    }

    if (truncated) break;

    nextUrl = nextPageUrl(data.pagination?.next, apiKey);
    if (lookbackStart && pageEntirelyBeforeLookback(items, lookbackStart)) {
      // Congress.gov returns House votes oldest-first. Early pages can predate the
      // lookback window; keep paging until we reach recent votes.
      continue;
    }
  }

  return {
    votes: out,
    skipped,
    truncated: truncated || undefined,
    nonPassageStubs: nonPassageStubs.length > 0 ? nonPassageStubs : undefined,
  };
}

function billMatches(a: BillRef, b: BillRef): boolean {
  return (
    a.congress === b.congress &&
    normalizeBillType(a.type) === normalizeBillType(b.type) &&
    a.number === b.number
  );
}

/** Scan House roll calls until matching passage votes for one bill are found. */
export async function ingestHousePassageVotesForBill(
  env: Env,
  targetBill: BillRef,
  knownKeys: ReadonlySet<string> = new Set(),
  maxPages = 50
): Promise<PassageVote[]> {
  const apiKey = env.CONGRESS_API_KEY;
  const congress = congressNumber(env);
  const session = sessionNumber(env);
  const out: PassageVote[] = [];
  let pages = 0;
  let nextUrl: string | null =
    `https://api.congress.gov/v3/house-vote/${congress}/${session}?format=json&limit=50&api_key=${apiKey}`;

  while (nextUrl && pages < maxPages) {
    pages += 1;
    const data: HouseVoteListResponse = await fetchJson<HouseVoteListResponse>(nextUrl);
    const items = data.houseRollCallVotes ?? [];

    for (const item of items) {
      if (!item.legislationNumber || !item.legislationType) continue;

      const key = voteKey({
        chamber: "House",
        congress,
        session,
        rollNumber: item.rollCallNumber,
      });
      if (knownKeys.has(key)) continue;

      const detailUrl = `https://api.congress.gov/v3/house-vote/${congress}/${session}/${item.rollCallNumber}?format=json&api_key=${apiKey}`;
      const detailRes = await fetchJson<HouseVoteDetailResponse>(detailUrl);
      const detail = detailRes.houseRollCallVote;
      const questionText = detail?.voteQuestion ?? "";
      const titleText = detail?.voteTitle ?? "";
      if (!isPassageVote(questionText) && !isPassageVote(titleText)) continue;

      const bill = parseHouseLegislation(
        detail!.legislationType ?? item.legislationType,
        detail!.legislationNumber ?? item.legislationNumber,
        congress
      );
      if (!bill || !billMatches(bill, targetBill)) continue;

      const { yeas, nays } = sumTally(detail!.votePartyTotal);
      const displayQuestion = isPassageVote(titleText)
        ? titleText.split(";")[0]!.trim()
        : questionText.trim();
      out.push({
        chamber: "House",
        congress,
        session,
        rollNumber: detail!.rollCallNumber,
        bill,
        question: displayQuestion.replace(/\s+/g, " ").trim(),
        result: detail!.result,
        yeas,
        nays,
        voteDate: voteDateFromIso(detail!.startDate),
      });
    }

    nextUrl = nextPageUrl(data.pagination?.next, apiKey);
  }

  return out;
}
