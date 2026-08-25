import type { Env } from "../config";
import { congressNumber, sessionNumber } from "../config";
import { HOUSE_VOTE_DETAIL_FETCHES_PER_RUN } from "../constants";
import type { BillRef, IngestVotesResult, NonPassageVoteStub, PassageVote } from "../types";
import { voteKey } from "../vote-key";
import { parseHouseLegislation } from "./bill-ref";
import { normalizeBillType } from "./bill-type";
import { fetchJson, nextPageUrl } from "./http";
import { isPassageVote } from "./passage";
import { maxIsoDay } from "../../../../shared/floor-quiet";

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

function laterIsoDay(current: string | undefined, isoOrDay: string): string | undefined {
  return maxIsoDay([current, isoOrDay]) ?? undefined;
}

/** A listed roll that still needs a detail request, with its bill reference known. */
type PendingRoll = HouseVoteListItem & {
  legislationNumber: string;
  legislationType: string;
};

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
  let sourceLatestDate: string | undefined;
  let coveredLatestDate: string | undefined;
  let nextUrl: string | null =
    `https://api.congress.gov/v3/house-vote/${congress}/${session}?format=json&limit=50&api_key=${apiKey}`;

  // Phase 1: page the list and collect rolls that still need a detail request.
  const pending: PendingRoll[] = [];
  while (nextUrl) {
    const data: HouseVoteListResponse = await fetchJson<HouseVoteListResponse>(nextUrl);
    const items = data.houseRollCallVotes ?? [];

    for (const item of items) {
      if (lookbackStart && !withinLookback(item.startDate, lookbackStart)) continue;
      if (!item.legislationNumber || !item.legislationType) continue;

      sourceLatestDate = laterIsoDay(sourceLatestDate, item.startDate);
      const key = voteKey({
        chamber: "House",
        congress,
        session,
        rollNumber: item.rollCallNumber,
      });
      if (knownKeys.has(key) || seenThisRun.has(key)) {
        skipped += 1;
        coveredLatestDate = laterIsoDay(coveredLatestDate, item.startDate);
        continue;
      }
      seenThisRun.add(key);
      pending.push({
        ...item,
        legislationNumber: item.legislationNumber,
        legislationType: item.legislationType,
      });
    }

    // Congress.gov returns House votes oldest-first, so early pages can predate
    // the lookback window entirely. Paging continues regardless until the list
    // is exhausted; there is no page at which it is safe to stop early.
    nextUrl = nextPageUrl(data.pagination?.next, apiKey);
  }

  // Phase 2: spend the detail budget newest-first. The list arrives oldest-first,
  // so a backlog of older rolls — such as the companion stubs written before
  // questions were stored — would otherwise delay the current week's passage
  // votes by however many runs the backlog takes to clear.
  pending.sort(
    (a, b) => b.startDate.localeCompare(a.startDate) || b.rollCallNumber - a.rollCallNumber
  );

  let detailFetches = 0;
  for (const item of pending) {
    // Passage votes and companion stubs each cost one detail request, so the
    // budget is shared. Stopping leaves the remaining rolls unknown for the
    // next run rather than dropping them.
    if (detailFetches >= HOUSE_VOTE_DETAIL_FETCHES_PER_RUN) {
      truncated = true;
      break;
    }

    const detailUrl = `https://api.congress.gov/v3/house-vote/${congress}/${session}/${item.rollCallNumber}?format=json&api_key=${apiKey}`;
    detailFetches += 1;
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

    if (!isPassageVote(questionText) && !isPassageVote(titleText)) {
      const stubTally = sumTally(detail.votePartyTotal);
      nonPassageStubs.push({
        chamber: "House",
        congress,
        session,
        rollNumber: item.rollCallNumber,
        bill,
        // Some rolls carry only a title. Storing an empty question would make
        // the row look unfilled forever: it is re-fetched by every run and
        // never shown as a companion vote.
        question: (questionText.trim() || titleText).replace(/\s+/g, " ").trim(),
        result: detail.result ?? item.result,
        yeas: stubTally.yeas,
        nays: stubTally.nays,
        voteDate: voteDateFromIso(detail.startDate ?? item.startDate),
      });
      coveredLatestDate = laterIsoDay(
        coveredLatestDate,
        detail.startDate ?? item.startDate
      );
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
    coveredLatestDate = laterIsoDay(coveredLatestDate, detail.startDate);

    if (maxNewVotes !== undefined && out.length >= maxNewVotes) {
      truncated = true;
      break;
    }
  }

  return {
    votes: out,
    skipped,
    truncated: truncated || undefined,
    nonPassageStubs: nonPassageStubs.length > 0 ? nonPassageStubs : undefined,
    ...(sourceLatestDate ? { sourceLatestDate } : {}),
    ...(coveredLatestDate ? { coveredLatestDate } : {}),
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
