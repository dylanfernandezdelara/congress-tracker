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

    const oldest = items[items.length - 1];
    if (lookbackStart && oldest && !withinLookback(oldest.startDate, lookbackStart)) {
      break;
    }

    nextUrl = data.pagination?.next ?? null;
    if (nextUrl && !nextUrl.includes("api_key=")) {
      nextUrl += nextUrl.includes("?") ? `&api_key=${apiKey}` : `?api_key=${apiKey}`;
    }
  }

  return { votes: out, skipped };
}
