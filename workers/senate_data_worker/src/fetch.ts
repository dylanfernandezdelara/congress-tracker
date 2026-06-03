/**
 * Senate XML transport: URL builders for the Senate vote menu/detail XML plus
 * the parallel vote-detail fetch helper. The generic retry/backoff/timeout
 * transport lives in `sources/http-client.ts` and is re-exported here for the
 * existing call sites (congress/govinfo/bill-evidence/member-ingest).
 */

import {
  fetchXmlWithRetry,
  type BatchFetchResult,
  type FetchConfig,
  type FetchResult,
} from "./sources/http-client";

export {
  fetchJsonWithRetry,
  fetchXmlWithRetry,
} from "./sources/http-client";
export type {
  BatchFetchResult,
  FetchConfig,
  FetchResult,
} from "./sources/http-client";

const DEFAULT_CONCURRENCY = 4;

// ============================================================================
// Senate XML URL Builders
// ============================================================================

const SENATE_XML_BASE = "https://www.senate.gov/legislative/LIS/";

/**
 * Build URL for Senate vote menu XML.
 */
export function buildVoteMenuUrl(congress: number, session: number): string {
  return `${SENATE_XML_BASE}roll_call_lists/vote_menu_${congress}_${session}.xml`;
}

/**
 * Build URL for a specific Senate vote detail XML.
 */
export function buildVoteDetailUrl(
  congress: number,
  session: number,
  voteNumber: number
): string {
  const paddedVote = String(voteNumber).padStart(5, "0");
  return `${SENATE_XML_BASE}roll_call_votes/vote${congress}${session}/vote_${congress}_${session}_${paddedVote}.xml`;
}

// ============================================================================
// Senate vote fetch helpers
// ============================================================================

/**
 * Fetch multiple vote detail XMLs in parallel with concurrency control.
 */
export async function fetchVoteDetailsParallel(
  voteNumbers: number[],
  congress: number,
  session: number,
  config: FetchConfig = {}
): Promise<BatchFetchResult<string>> {
  const concurrency = config.concurrency ?? DEFAULT_CONCURRENCY;
  const results = new Map<number, FetchResult<string>>();
  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < voteNumbers.length; i += concurrency) {
    const batch = voteNumbers.slice(i, i + concurrency);
    const batchPromises = batch.map(async (voteNumber) => {
      const url = buildVoteDetailUrl(congress, session, voteNumber);
      const result = await fetchXmlWithRetry(url, config);
      return { voteNumber, result };
    });

    const batchResults = await Promise.all(batchPromises);

    for (const { voteNumber, result } of batchResults) {
      results.set(voteNumber, result);
      if (result.success) {
        successCount++;
      } else {
        failureCount++;
      }
    }
  }

  return { results, successCount, failureCount };
}

/**
 * Fetch the vote menu XML.
 */
export async function fetchVoteMenu(
  congress: number,
  session: number,
  config: FetchConfig = {}
): Promise<FetchResult<string>> {
  const url = buildVoteMenuUrl(congress, session);
  return fetchXmlWithRetry(url, config);
}
