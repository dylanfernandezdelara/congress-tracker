import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSenateLegislativeText } from "./senate-fetch";

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

  it("throws after exhausting retries on persistent 403", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("", { status: 403, statusText: "Forbidden" }));

    await expect(
      fetchSenateLegislativeText(
        "https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_119_2.xml"
      )
    ).rejects.toThrow("HTTP 403");

    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
