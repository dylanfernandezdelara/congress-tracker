import type { Env } from "../config";
import { congressNumber, sessionNumber } from "../config";
import type { IngestVotesResult, PassageVote } from "../types";
import { voteKey } from "../vote-key";
import { parseHouseLegislation } from "./bill-ref";
import { fetchJson } from "./http";
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

function nextPageUrl(raw: string | undefined | null, apiKey: string): string | null {
  if (!raw) return null;
  if (raw.includes("api_key=")) return raw;
  return raw.includes("?") ? `${raw}&api_key=${apiKey}` : `${raw}?api_key=${apiKey}`;
}

export async function ingestHousePassageVotes(
  env: Env,
  lookbackStart: string | null,
  knownKeys: ReadonlySet<string> = new Set()
): Promise<IngestVotesResult> {
  const apiKey = env.CONGRESS_API_KEY;
  const congress = congressNumber(env);
  const session = sessionNumber(env);
  const out: PassageVote[] = [];
  let skipped = 0;
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
      if (knownKeys.has(key)) {
        skipped += 1;
        continue;
      }

      const detailUrl = `https://api.congress.gov/v3/house-vote/${congress}/${session}/${item.rollCallNumber}?format=json&api_key=${apiKey}`;
      const detailRes = await fetchJson<HouseVoteDetailResponse>(detailUrl);
      const detail = detailRes.houseRollCallVote;
      if (!detail?.voteQuestion || !isPassageVote(detail.voteQuestion)) continue;

      const bill = parseHouseLegislation(
        detail.legislationType ?? item.legislationType,
        detail.legislationNumber ?? item.legislationNumber,
        congress
      );
      if (!bill) continue;

      const { yeas, nays } = sumTally(detail.votePartyTotal);
      out.push({
        chamber: "House",
        congress,
        session,
        rollNumber: detail.rollCallNumber,
        bill,
        question: detail.voteQuestion.trim(),
        result: detail.result,
        yeas,
        nays,
        voteDate: voteDateFromIso(detail.startDate),
      });
    }

    nextUrl = nextPageUrl(data.pagination?.next, apiKey);
    if (lookbackStart && pageEntirelyBeforeLookback(items, lookbackStart)) {
      // Congress.gov returns House votes oldest-first. Early pages can predate the
      // lookback window; keep paging until we reach recent votes.
      continue;
    }
  }

  return { votes: out, skipped };
}
