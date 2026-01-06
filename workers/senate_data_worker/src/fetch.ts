/**
 * HTTP fetching utilities with retry, backoff, and timeouts.
 *
 * Handles the quirks of fetching Senate XML:
 * - Automatic retries with exponential backoff
 * - Configurable timeouts
 * - Parallel fetching with concurrency limits
 */

// ============================================================================
// Types
// ============================================================================

export interface FetchConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (default: 1000) */
  baseDelayMs?: number;
  /** Request timeout in ms (default: 10000) */
  timeoutMs?: number;
  /** Maximum concurrent requests (default: 5) */
  concurrency?: number;
}

export interface FetchResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
}

const DEFAULT_CONFIG: Required<FetchConfig> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  timeoutMs: 10000,
  concurrency: 5,
};

// ============================================================================
// URL Builders
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
// Core Fetch Functions
// ============================================================================

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch a URL with timeout support.
 */
async function fetchWithTimeout(
  url: string,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "SenateDataWorker/1.0 (Cloudflare Worker)",
        Accept: "application/xml, text/xml, */*",
      },
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch XML content with automatic retry and exponential backoff.
 *
 * @param url - The URL to fetch
 * @param config - Fetch configuration options
 * @returns FetchResult with the XML string or error
 */
export async function fetchXmlWithRetry(
  url: string,
  config: FetchConfig = {}
): Promise<FetchResult<string>> {
  const { maxRetries, baseDelayMs, timeoutMs } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  let lastError: string | undefined;
  let lastStatusCode: number | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, timeoutMs);
      lastStatusCode = response.status;

      if (response.ok) {
        const text = await response.text();
        return { success: true, data: text, statusCode: response.status };
      }

      // Don't retry client errors (4xx) except 429 (rate limit)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          statusCode: response.status,
        };
      }

      lastError = `HTTP ${response.status}: ${response.statusText}`;
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === "AbortError") {
          lastError = `Request timeout after ${timeoutMs}ms`;
        } else {
          lastError = err.message;
        }
      } else {
        lastError = String(err);
      }
    }

    // Exponential backoff before retry
    if (attempt < maxRetries) {
      const delayMs = baseDelayMs * Math.pow(2, attempt);
      await sleep(delayMs);
    }
  }

  return {
    success: false,
    error: lastError ?? "Unknown error",
    statusCode: lastStatusCode,
  };
}

// ============================================================================
// Parallel Fetch Utilities
// ============================================================================

/**
 * Result of a batch fetch operation.
 */
export interface BatchFetchResult<T> {
  results: Map<number, FetchResult<T>>;
  successCount: number;
  failureCount: number;
}

/**
 * Fetch multiple vote detail XMLs in parallel with concurrency control.
 *
 * @param voteNumbers - Array of vote numbers to fetch
 * @param congress - Congress number
 * @param session - Session number
 * @param config - Fetch configuration options
 * @returns Map of vote number to fetch result
 */
export async function fetchVoteDetailsParallel(
  voteNumbers: number[],
  congress: number,
  session: number,
  config: FetchConfig = {}
): Promise<BatchFetchResult<string>> {
  const { concurrency } = { ...DEFAULT_CONFIG, ...config };
  const results = new Map<number, FetchResult<string>>();
  let successCount = 0;
  let failureCount = 0;

  // Process in batches for concurrency control
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
 *
 * @param congress - Congress number
 * @param session - Session number
 * @param config - Fetch configuration options
 * @returns FetchResult with the XML string
 */
export async function fetchVoteMenu(
  congress: number,
  session: number,
  config: FetchConfig = {}
): Promise<FetchResult<string>> {
  const url = buildVoteMenuUrl(congress, session);
  return fetchXmlWithRetry(url, config);
}

