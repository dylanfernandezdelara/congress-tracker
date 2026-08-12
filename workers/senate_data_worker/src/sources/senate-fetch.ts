import { USER_AGENT } from "../constants";
import { redactUrl } from "./http";
import {
  assertSenateGovLisUrl,
  fetchSenateXmlViaBrowser,
  type SenateBrowserBinding,
} from "./senate-browser-xml";

const SENATE_FETCH_MAX_ATTEMPTS = 3;
const SENATE_FETCH_RETRY_MS = [500, 1500, 3000];

export type FetchSenateLegislativeTextOptions = {
  /** Cloudflare Browser Rendering binding — used after plain fetch keeps failing. */
  browser?: SenateBrowserBinding | null;
};

type PlainFetchFailure = {
  error: Error;
  /** Set when failure was an HTTP status response (not a thrown network error). */
  httpStatus?: number;
};

/**
 * Once Akamai 403 is observed in this isolate, skip further plain fetches and
 * go straight to Browser Rendering (member-votes catch-up can hit many rolls).
 */
let plainFetchBlockedThisIsolate = false;

/** Test helper: reset the isolate latch between cases. */
export function resetSenatePlainFetchLatchForTests(): void {
  plainFetchBlockedThisIsolate = false;
}

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
 * Decide whether to attempt Browser Rendering after plain fetch failed.
 * - Thrown/network errors: always try BR when bound (message-agnostic).
 * - HTTP responses: only retryable statuses (403/429/5xx).
 */
function shouldTryBrowserFallback(failure: PlainFetchFailure | null): boolean {
  if (!failure) return false;
  if (failure.httpStatus === undefined) return true;
  return isRetryableSenateStatus(failure.httpStatus);
}

async function tryBrowserFallback(
  browser: SenateBrowserBinding,
  url: string,
  priorMessage: string
): Promise<string> {
  try {
    const xml = await fetchSenateXmlViaBrowser(browser, url);
    console.warn(
      JSON.stringify({
        event: "senate_fetch_browser_rendering_fallback",
        url: redactUrl(url),
        prior_error: priorMessage,
      })
    );
    return xml;
  } catch (browserErr: unknown) {
    const browserMessage =
      browserErr instanceof Error ? browserErr.message : String(browserErr);
    throw new Error(`${priorMessage}; Browser Rendering fallback failed: ${browserMessage}`);
  }
}

/**
 * Fetch Senate LIS XML with browser-like headers and retries.
 * Senate.gov Akamai WAF often blocks Worker datacenter IPs. When plain `fetch`
 * keeps failing and a Browser Rendering binding is provided, fall back to that
 * Cloudflare-native path (proven to reach senate.gov from this account).
 *
 * When `browser` is set, the first retryable failure (typically HTTP 403) skips
 * further plain-fetch retries and goes straight to Browser Rendering — important
 * for member-votes runs that may hit many rolls after a persistent block.
 */
export async function fetchSenateLegislativeText(
  url: string,
  options: FetchSenateLegislativeTextOptions = {}
): Promise<string> {
  // Same allowlist as BR — reject non-LIS URLs before any outbound call.
  assertSenateGovLisUrl(url);

  let lastFailure: PlainFetchFailure | null = null;
  const maxAttempts = options.browser ? 1 : SENATE_FETCH_MAX_ATTEMPTS;
  const skipPlainFetch = Boolean(options.browser) && plainFetchBlockedThisIsolate;

  if (!skipPlainFetch) {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (attempt > 0) {
        await sleep(SENATE_FETCH_RETRY_MS[attempt - 1] ?? 3000);
      }

      try {
        const res = await fetch(url, {
          headers: senateRequestHeaders(),
          cf: { cacheTtl: 300, cacheEverything: true },
        });

        if (res.ok) {
          return res.text();
        }

        lastFailure = {
          error: new Error(`HTTP ${res.status} for ${redactUrl(url)}`),
          httpStatus: res.status,
        };
        if (res.status === 403 && options.browser) {
          plainFetchBlockedThisIsolate = true;
        }
        if (!isRetryableSenateStatus(res.status) || attempt === maxAttempts - 1) {
          break;
        }
      } catch (err: unknown) {
        lastFailure = {
          error: err instanceof Error ? err : new Error(String(err)),
        };
        if (attempt === maxAttempts - 1) {
          break;
        }
      }
    }
  } else {
    lastFailure = {
      error: new Error(`HTTP 403 for ${redactUrl(url)} (plain fetch latched blocked)`),
      httpStatus: 403,
    };
  }

  const priorMessage =
    lastFailure?.error.message ?? `HTTP fetch failed for ${redactUrl(url)}`;
  if (options.browser && shouldTryBrowserFallback(lastFailure)) {
    return tryBrowserFallback(options.browser, url, priorMessage);
  }

  throw lastFailure?.error ?? new Error(priorMessage);
}
