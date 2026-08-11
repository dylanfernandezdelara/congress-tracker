/**
 * Helpers for Senate.gov XML fetched via Cloudflare Browser Rendering.
 *
 * Chromium's XML viewer wraps raw XML in HTML with a
 * `#webkit-xml-viewer-source-xml` div. Direct `fetch()` from Workers is often
 * Akamai-blocked (HTTP 403); Browser Rendering still reaches senate.gov.
 */

const WEBKIT_SOURCE_XML_RE =
  /<div id="webkit-xml-viewer-source-xml"[^>]*>([\s\S]*?)<\/div>/i;

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
  if (trimmed.startsWith("<?xml") || trimmed.startsWith("<")) {
    if (
      !trimmed.includes("<html") &&
      !trimmed.includes("webkit-xml-viewer-source-xml")
    ) {
      return trimmed;
    }
  }

  const match = trimmed.match(WEBKIT_SOURCE_XML_RE);
  const extracted = match?.[1]?.trim();
  if (extracted?.startsWith("<")) {
    return extracted;
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
  const response = await browser.quickAction("content", {
    url,
    gotoOptions: {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    },
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Browser Rendering content failed (${response.status}): ${detail}`);
  }

  const body = (await response.json()) as {
    success?: boolean;
    result?: unknown;
    errors?: unknown;
  };

  if (!body.success || typeof body.result !== "string") {
    throw new Error(
      `Browser Rendering content unsuccessful: ${JSON.stringify(body.errors ?? body).slice(0, 300)}`
    );
  }

  return extractSenateXmlFromBrowserContent(body.result);
}
