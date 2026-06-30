import { USER_AGENT } from "../constants";
import { redactUrl } from "./http";

const SENATE_FETCH_MAX_ATTEMPTS = 3;
const SENATE_FETCH_RETRY_MS = [500, 1500, 3000];

function senateRequestHeaders(): HeadersInit {
  return {
    "User-Agent": USER_AGENT,
    Accept: "application/xml,text/xml,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: "https://www.senate.gov/legislative/votes_new.htm",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableSenateStatus(status: number): boolean {
  return status === 403 || status === 429 || status >= 500;
}

/**
 * Fetch Senate LIS XML with browser-like headers and retries.
 * Senate.gov Akamai WAF often blocks datacenter IPs; retries help transient failures.
 */
export async function fetchSenateLegislativeText(url: string): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < SENATE_FETCH_MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      await sleep(SENATE_FETCH_RETRY_MS[attempt - 1] ?? 3000);
    }

    const res = await fetch(url, {
      headers: senateRequestHeaders(),
      cf: { cacheTtl: 300, cacheEverything: true },
    });

    if (res.ok) {
      return res.text();
    }

    lastError = new Error(`HTTP ${res.status} for ${redactUrl(url)}`);
    if (!isRetryableSenateStatus(res.status) || attempt === SENATE_FETCH_MAX_ATTEMPTS - 1) {
      throw lastError;
    }
  }

  throw lastError ?? new Error(`HTTP fetch failed for ${redactUrl(url)}`);
}
