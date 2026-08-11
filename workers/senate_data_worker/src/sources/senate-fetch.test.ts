import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSenateLegislativeText } from "./senate-fetch";
import type { SenateBrowserBinding } from "./senate-browser-xml";

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

    const text = await fetchSenateLegislativeText(
      "https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_119_2.xml"
    );

    expect(text).toBe("<votes></votes>");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("retries on 403 and succeeds on later attempt", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response("", { status: 403, statusText: "Forbidden" }))
      .mockResolvedValueOnce(new Response("<votes></votes>", { status: 200, statusText: "OK" }));

    const text = await fetchSenateLegislativeText(
      "https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_119_2.xml"
    );

    expect(text).toBe("<votes></votes>");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting retries on persistent 403 without browser binding", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("", { status: 403, statusText: "Forbidden" }));

    await expect(
      fetchSenateLegislativeText(
        "https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_119_2.xml"
      )
    ).rejects.toThrow("HTTP 403");

    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("falls back to Browser Rendering after persistent 403", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("", { status: 403, statusText: "Forbidden" }));
    const browser: SenateBrowserBinding = {
      quickAction: vi.fn(async () =>
        Response.json({
          success: true,
          result: `<?xml version="1.0"?><vote_summary><congress>119</congress></vote_summary>`,
        })
      ),
    };

    const text = await fetchSenateLegislativeText(
      "https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_119_2.xml",
      { browser }
    );

    expect(text).toContain("<vote_summary>");
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(browser.quickAction).toHaveBeenCalledOnce();
  });
});
