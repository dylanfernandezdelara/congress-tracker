import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSenateLegislativeText, resetSenatePlainFetchLatchForTests } from "./senate-fetch";
import {
  resetSenateBrowserFetchBudgetForTests,
  type SenateBrowserBinding,
} from "./senate-browser-xml";

const MENU_URL =
  "https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_119_2.xml";

function okBrowser(result = `<?xml version="1.0"?><vote_summary><congress>119</congress></vote_summary>`): SenateBrowserBinding {
  return {
    quickAction: vi.fn(async () => Response.json({ success: true, result })),
  };
}

describe("fetchSenateLegislativeText", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    resetSenatePlainFetchLatchForTests();
    resetSenateBrowserFetchBudgetForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns text on success", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("<votes></votes>", { status: 200, statusText: "OK" })
    );

    const text = await fetchSenateLegislativeText(MENU_URL);

    expect(text).toBe("<votes></votes>");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("rejects non-Senate LIS URLs before outbound fetch", async () => {
    await expect(fetchSenateLegislativeText("https://evil.example/x.xml")).rejects.toThrow(
      /host/i
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("retries on 403 and succeeds on later attempt when no browser binding", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response("", { status: 403, statusText: "Forbidden" }))
      .mockResolvedValueOnce(new Response("<votes></votes>", { status: 200, statusText: "OK" }));

    const text = await fetchSenateLegislativeText(MENU_URL);

    expect(text).toBe("<votes></votes>");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting retries on persistent 403 without browser binding", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("", { status: 403, statusText: "Forbidden" }));

    await expect(fetchSenateLegislativeText(MENU_URL)).rejects.toThrow("HTTP 403");

    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("skips plain-fetch retries and uses Browser Rendering on first 403 when bound", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("", { status: 403, statusText: "Forbidden" }));
    const browser = okBrowser();

    const text = await fetchSenateLegislativeText(MENU_URL, { browser });

    expect(text).toContain("<vote_summary>");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(browser.quickAction).toHaveBeenCalledOnce();
  });

  it("falls back to Browser Rendering after a network failure including ECONNRESET", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("ECONNRESET"));
    const browser = okBrowser();

    const text = await fetchSenateLegislativeText(MENU_URL, { browser });
    expect(text).toContain("<vote_summary>");
    expect(browser.quickAction).toHaveBeenCalledOnce();
  });

  it("falls back to Browser Rendering for opaque Worker transport errors", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("Fetch from origin failed"));
    const browser = okBrowser();

    const text = await fetchSenateLegislativeText(MENU_URL, { browser });
    expect(text).toContain("<vote_summary>");
    expect(browser.quickAction).toHaveBeenCalledOnce();
  });

  it("latches plain-fetch blocked after 403 so later calls skip straight to BR", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("", { status: 403, statusText: "Forbidden" }));
    const browser = okBrowser();

    await fetchSenateLegislativeText(MENU_URL, { browser });
    await fetchSenateLegislativeText(
      "https://www.senate.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_00228.xml",
      { browser }
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(browser.quickAction).toHaveBeenCalledTimes(2);
  });

  it("does not use Browser Rendering for non-retryable HTTP 404", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("", { status: 404, statusText: "Not Found" }));
    const browser = okBrowser();

    await expect(fetchSenateLegislativeText(MENU_URL, { browser })).rejects.toThrow("HTTP 404");
    expect(browser.quickAction).not.toHaveBeenCalled();
  });
});
