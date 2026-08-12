import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSenateLegislativeText } from "./senate-fetch";
import type { SenateBrowserBinding } from "./senate-browser-xml";

const MENU_URL =
  "https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_119_2.xml";

describe("fetchSenateLegislativeText", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
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
    const browser: SenateBrowserBinding = {
      quickAction: vi.fn(async () =>
        Response.json({
          success: true,
          result: `<?xml version="1.0"?><vote_summary><congress>119</congress></vote_summary>`,
        })
      ),
    };

    const text = await fetchSenateLegislativeText(MENU_URL, { browser });

    expect(text).toContain("<vote_summary>");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(browser.quickAction).toHaveBeenCalledOnce();
  });

  it("falls back to Browser Rendering after a network failure", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network failed"));
    const browser: SenateBrowserBinding = {
      quickAction: vi.fn(async () =>
        Response.json({
          success: true,
          result: `<?xml version="1.0"?><vote_summary><congress>119</congress></vote_summary>`,
        })
      ),
    };

    const text = await fetchSenateLegislativeText(MENU_URL, { browser });
    expect(text).toContain("<vote_summary>");
    expect(browser.quickAction).toHaveBeenCalledOnce();
  });
});
