/**
 * Helpers for Senate.gov XML fetched via Cloudflare Browser Rendering.
 *
 * Chromium's XML viewer wraps raw XML in HTML with a
 * `#webkit-xml-viewer-source-xml` div. Direct `fetch()` from Workers is often
 * Akamai-blocked (HTTP 403); Browser Rendering still reaches senate.gov.
 */

const WEBKIT_SOURCE_OPEN_RE =
  /<div\s+[^>]*\bid\s*=\s*["']webkit-xml-viewer-source-xml["'][^>]*>/i;

const SENATE_GOV_HOST = "www.senate.gov";
const SENATE_LIS_PATH_PREFIXES = [
  "/legislative/LIS/roll_call_lists/",
  "/legislative/LIS/roll_call_votes/",
] as const;

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
  if (parsed.hostname.toLowerCase() !== SENATE_GOV_HOST) {
    throw new Error(`Browser Rendering URL host must be ${SENATE_GOV_HOST}`);
  }
  const pathOk = SENATE_LIS_PATH_PREFIXES.some((prefix) => parsed.pathname.startsWith(prefix));
  if (!pathOk) {
    throw new Error("Browser Rendering URL path is not a Senate LIS roll-call XML path");
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

/**
 * Fetch Senate.gov XML through Browser Rendering `/content` when plain Worker
 * `fetch` is blocked.
 */
export async function fetchSenateXmlViaBrowser(
  browser: SenateBrowserBinding,
  url: string
): Promise<string> {
  const allowed = assertSenateGovLisUrl(url);

  let response: Response;
  try {
    response = await browser.quickAction("content", {
      url: allowed.toString(),
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
    throw new Error(`Browser Rendering content failed (${response.status}): ${detail}`);
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
