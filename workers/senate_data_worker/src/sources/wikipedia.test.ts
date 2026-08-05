import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acceptWikipediaSummary,
  fetchWikipediaArticlePlainText,
  truncateWikipediaExtract,
  wikipediaTitleFromUrl,
} from "./wikipedia";

describe("wikipediaTitleFromUrl", () => {
  it("decodes the article title from a page URL", () => {
    expect(
      wikipediaTitleFromUrl("https://en.wikipedia.org/wiki/Erica_Schwartz")
    ).toBe("Erica Schwartz");
    expect(
      wikipediaTitleFromUrl("https://en.wikipedia.org/wiki/Jane_Doe_(politician)#Career")
    ).toBe("Jane Doe (politician)");
  });

  it("returns null for non-article URLs", () => {
    expect(wikipediaTitleFromUrl("https://example.com/not-wikipedia")).toBeNull();
  });
});

describe("fetchWikipediaArticlePlainText", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the article plain text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            query: { pages: { "1": { extract: "Full article text." } } },
          }),
          { status: 200 }
        )
      )
    );
    expect(
      await fetchWikipediaArticlePlainText("https://en.wikipedia.org/wiki/Erica_Schwartz")
    ).toEqual({ status: "ok", text: "Full article text." });
  });

  it("treats a missing/empty extract as unavailable so callers never seal on it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ query: { pages: { "-1": {} } } }), {
          status: 200,
        })
      )
    );
    const result = await fetchWikipediaArticlePlainText(
      "https://en.wikipedia.org/wiki/Erica_Schwartz"
    );
    expect(result.status).toBe("unavailable");
  });
});

describe("truncateWikipediaExtract", () => {
  it("keeps short extracts intact", () => {
    expect(truncateWikipediaExtract("Jane Doe is an American diplomat.")).toBe(
      "Jane Doe is an American diplomat."
    );
  });

  it("prefers a sentence boundary inside the window", () => {
    const extract =
      "Jane Doe is an American energy official. She previously led state programs. She also taught policy.";
    const out = truncateWikipediaExtract(extract, 90);
    expect(out.endsWith(".")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(90);
  });
});

describe("acceptWikipediaSummary", () => {
  it("accepts a matching person page with a role cue", () => {
    const hit = acceptWikipediaSummary(
      {
        type: "standard",
        title: "Jane Doe (politician)",
        description: "American politician",
        extract: "Jane Doe is an American politician who served in California.",
        content_urls: {
          desktop: { page: "https://en.wikipedia.org/wiki/Jane_Doe_(politician)" },
        },
      },
      "Jane Doe"
    );
    expect(hit?.url).toBe("https://en.wikipedia.org/wiki/Jane_Doe_(politician)");
  });

  it("rejects surname-only matches without a person cue", () => {
    const hit = acceptWikipediaSummary(
      {
        type: "standard",
        title: "Doe River",
        description: "River in Tennessee",
        extract: "The Doe River is a tributary of the Watauga River.",
        content_urls: {
          desktop: { page: "https://en.wikipedia.org/wiki/Doe_River" },
        },
      },
      "Jane Doe"
    );
    expect(hit).toBeNull();
  });

  it("rejects same-surname pages that lack the given name", () => {
    const hit = acceptWikipediaSummary(
      {
        type: "standard",
        title: "John Doe (politician)",
        description: "American politician",
        extract: "John Doe is an American politician from Ohio.",
        content_urls: {
          desktop: { page: "https://en.wikipedia.org/wiki/John_Doe_(politician)" },
        },
      },
      "Jane Doe"
    );
    expect(hit).toBeNull();
  });

  it("accepts nickname titles when the extract names the nominee", () => {
    const hit = acceptWikipediaSummary(
      {
        type: "standard",
        title: "Jay Clayton (attorney)",
        description: "American attorney (born 1966)",
        extract:
          'Walter Joseph "Jay" Clayton III is an American attorney who is the designate director of national intelligence.',
        content_urls: {
          desktop: { page: "https://en.wikipedia.org/wiki/Jay_Clayton_(attorney)" },
        },
      },
      "Walter Clayton"
    );
    expect(hit?.url).toBe("https://en.wikipedia.org/wiki/Jay_Clayton_(attorney)");
  });

  it("rejects office/role pages even when they mention secretary", () => {
    const hit = acceptWikipediaSummary(
      {
        type: "standard",
        title: "United States Secretary of Energy",
        description: "U.S. cabinet position",
        extract:
          "The United States secretary of energy is the head of the U.S. Department of Energy and a member of the president's cabinet.",
        content_urls: {
          desktop: { page: "https://en.wikipedia.org/wiki/United_States_Secretary_of_Energy" },
        },
      },
      "Jane Doe"
    );
    expect(hit).toBeNull();
  });

  it("rejects extracts that define the office without naming the person", () => {
    const hit = acceptWikipediaSummary(
      {
        type: "standard",
        title: "Jane Doe (energy official)",
        description: "American official",
        extract:
          "The secretary of energy is the head of the U.S. Department of Energy and a member of the president's cabinet.",
        content_urls: {
          desktop: { page: "https://en.wikipedia.org/wiki/Jane_Doe_(energy_official)" },
        },
      },
      "Jane Doe"
    );
    expect(hit).toBeNull();
  });
});
