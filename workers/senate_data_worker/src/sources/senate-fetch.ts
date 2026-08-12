import { USER_AGENT } from "../constants";
import { redactUrl } from "./http";
import {
  fetchSenateXmlViaBrowser,
  type SenateBrowserBinding,
} from "./senate-browser-xml";

const SENATE_FETCH_MAX_ATTEMPTS = 3;
const SENATE_FETCH_RETRY_MS = [500, 1500, 3000];

export type FetchSenateLegislativeTextOptions = {
  /** Cloudflare Browser Rendering binding — used after plain fetch keeps failing. */
  browser?: SenateBrowserBinding | null;
};

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

function shouldTryBrowserFallback(message: string): boolean {
  return (
    message.includes("HTTP 403") ||
    message.includes("HTTP 429") ||
    /HTTP 5\d\d/.test(message) ||
    /network|fetch failed|Failed to fetch|timed out|Timeout/i.test(message)
  );
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
  let lastError: Error | null = null;
  const maxAttempts = options.browser ? 1 : SENATE_FETCH_MAX_ATTEMPTS;

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

      lastError = new Error(`HTTP ${res.status} for ${redactUrl(url)}`);
      if (!isRetryableSenateStatus(res.status) || attempt === maxAttempts - 1) {
        break;
      }
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt === maxAttempts - 1) {
        break;
      }
    }
  }

  const priorMessage = lastError?.message ?? `HTTP fetch failed for ${redactUrl(url)}`;
  if (options.browser && shouldTryBrowserFallback(priorMessage)) {
    return tryBrowserFallback(options.browser, url, priorMessage);
  }

  throw lastError ?? new Error(priorMessage);
}
