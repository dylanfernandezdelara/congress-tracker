/**
 * Helpers for Senate.gov XML fetched via Cloudflare Browser Rendering.
 *
 * Chromium's XML viewer wraps raw XML in HTML with a
 * `#webkit-xml-viewer-source-xml` div. Direct `fetch()` from Workers is often
 * Akamai-blocked (HTTP 403); Browser Rendering still reaches senate.gov.
 */

import { SENATE_BROWSER_FETCHES_MAX_PER_RUN } from "../constants";

const WEBKIT_SOURCE_OPEN_RE =
  /<div\s+[^>]*\bid\s*=\s*["']webkit-xml-viewer-source-xml["'][^>]*>/i;

const SENATE_GOV_HOST = "www.senate.gov";
const SENATE_LIS_PATH_PREFIXES = [
  "/legislative/LIS/roll_call_lists/",
  "/legislative/LIS/roll_call_votes/",
] as const;

const BROWSER_FETCH_MAX_ATTEMPTS = 3;
const BROWSER_FETCH_RETRY_MS = [500, 1500, 3000];

/** Minimal Browser Run binding surface used for Senate menu/detail XML. */
export type SenateBrowserBinding = {
  quickAction(
    action: "content",
    options: {
      url: string;
      gotoOptions?: { waitUntil?: string; timeout?: number };
    }
  ): Promise<Response>;
};

/** Per-isolate counter — one cron/admin invocation shares one Worker isolate. */
let browserFetchesThisIsolate = 0;

/** Test helper: reset isolate budget between cases. */
export function resetSenateBrowserFetchBudgetForTests(): void {
  browserFetchesThisIsolate = 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableBrowserFailure(message: string, status?: number): boolean {
  if (status !== undefined) {
    return status === 429 || status >= 500;
  }
  return /429|5\d\d|network|timed out|Timeout|quickAction failed|ECONNRESET|fetch failed/i.test(
    message
  );
}

/** Reject non-Senate LIS URLs before handing them to Browser Rendering. */
export function assertSenateGovLisUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Browser Rendering URL is not a valid absolute URL");
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`Browser Rendering URL must use https (got ${parsed.protocol})`);
  }
  if (parsed.username || parsed.password) {
    throw new Error("Browser Rendering URL must not include credentials");
  }
  if (parsed.hostname.toLowerCase() !== SENATE_GOV_HOST) {
    throw new Error(`Browser Rendering URL host must be ${SENATE_GOV_HOST}`);
  }
  const pathOk = SENATE_LIS_PATH_PREFIXES.some((prefix) => parsed.pathname.startsWith(prefix));
  if (!pathOk) {
    throw new Error("Browser Rendering URL path is not a Senate LIS roll-call XML path");
  }
  if (!parsed.pathname.toLowerCase().endsWith(".xml")) {
    throw new Error("Browser Rendering URL path must end in .xml");
  }
  return parsed;
}

/**
 * Pull Senate LIS XML out of a Browser Rendering `/content` payload.
 * Accepts already-raw XML, or Chromium's XML-viewer HTML wrapper.
 */
export function extractSenateXmlFromBrowserContent(htmlOrXml: string): string {
  const trimmed = htmlOrXml.trim();
  if (!trimmed) {
    throw new Error("Browser Rendering returned empty content");
  }

  // Raw XML (or XML declared with a prologue).
  if (
    (trimmed.startsWith("<?xml") || trimmed.startsWith("<")) &&
    !trimmed.includes("webkit-xml-viewer-source-xml") &&
    !/<html[\s>]/i.test(trimmed)
  ) {
    return trimmed;
  }

  const open = trimmed.match(WEBKIT_SOURCE_OPEN_RE);
  if (open?.index !== undefined) {
    const start = open.index + open[0].length;
    // Close at the first </div> after the source open tag (not the last in the
    // document — later Chromium chrome may add more wrappers).
    const close = trimmed.indexOf("</div>", start);
    if (close > start) {
      const extracted = trimmed.slice(start, close).trim();
      if (extracted.startsWith("<")) {
        return extracted;
      }
    }
  }

  throw new Error("Browser Rendering did not return extractable Senate XML");
}

async function browserContentOnce(
  browser: SenateBrowserBinding,
  url: string
): Promise<string> {
  let response: Response;
  try {
    response = await browser.quickAction("content", {
      url,
      gotoOptions: {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Browser Rendering quickAction failed: ${message}`);
  }

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    const error = new Error(
      `Browser Rendering content failed (${response.status}): ${detail}`
    ) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  let body: { success?: boolean; result?: unknown; errors?: unknown };
  try {
    body = (await response.json()) as {
      success?: boolean;
      result?: unknown;
      errors?: unknown;
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Browser Rendering content returned non-JSON: ${message}`);
  }

  if (!body.success || typeof body.result !== "string") {
    throw new Error(
      `Browser Rendering content unsuccessful: ${JSON.stringify(body.errors ?? body).slice(0, 300)}`
    );
  }

  return extractSenateXmlFromBrowserContent(body.result);
}

/**
 * Fetch Senate.gov XML through Browser Rendering `/content` when plain Worker
 * `fetch` is blocked. Retries transient 429/5xx/network failures.
 */
export async function fetchSenateXmlViaBrowser(
  browser: SenateBrowserBinding,
  url: string
): Promise<string> {
  const allowed = assertSenateGovLisUrl(url);

  if (browserFetchesThisIsolate >= SENATE_BROWSER_FETCHES_MAX_PER_RUN) {
    throw new Error(
      `Browser Rendering budget exhausted (${SENATE_BROWSER_FETCHES_MAX_PER_RUN}/run); retry next cron`
    );
  }
  browserFetchesThisIsolate += 1;

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < BROWSER_FETCH_MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      await sleep(BROWSER_FETCH_RETRY_MS[attempt - 1] ?? 3000);
    }
    try {
      const xml = await browserContentOnce(browser, allowed.toString());
      if (attempt > 0) {
        console.warn(
          JSON.stringify({
            event: "senate_browser_rendering_retry_succeeded",
            attempt: attempt + 1,
            url: allowed.pathname,
          })
        );
      }
      return xml;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const status = (err as { status?: number } | null)?.status;
      const retryable = isRetryableBrowserFailure(lastError.message, status);
      if (!retryable || attempt === BROWSER_FETCH_MAX_ATTEMPTS - 1) {
        break;
      }
      console.warn(
        JSON.stringify({
          event: "senate_browser_rendering_retry",
          attempt: attempt + 1,
          max_attempts: BROWSER_FETCH_MAX_ATTEMPTS,
          error: lastError.message.slice(0, 200),
        })
      );
    }
  }

  throw lastError ?? new Error("Browser Rendering failed");
}
