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

/**
 * Fetch Senate LIS XML with browser-like headers and retries.
 * Senate.gov Akamai WAF often blocks Worker datacenter IPs. When plain `fetch`
 * keeps failing and a Browser Rendering binding is provided, fall back to that
 * Cloudflare-native path (proven to reach senate.gov from this account).
 */
export async function fetchSenateLegislativeText(
  url: string,
  options: FetchSenateLegislativeTextOptions = {}
): Promise<string> {
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
      break;
    }
  }

  const priorMessage = lastError?.message ?? `HTTP fetch failed for ${redactUrl(url)}`;
  const shouldTryBrowser =
    Boolean(options.browser) &&
    (priorMessage.includes("HTTP 403") ||
      priorMessage.includes("HTTP 429") ||
      /HTTP 5\d\d/.test(priorMessage));

  if (shouldTryBrowser && options.browser) {
    try {
      const xml = await fetchSenateXmlViaBrowser(options.browser, url);
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

  throw lastError ?? new Error(priorMessage);
}
