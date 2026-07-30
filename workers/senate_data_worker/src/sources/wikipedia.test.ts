import { describe, expect, it } from "vitest";
import {
  acceptWikipediaSummary,
  truncateWikipediaExtract,
  wikipediaSearchUrl,
} from "./wikipedia";

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

describe("wikipediaSearchUrl", () => {
  it("builds a Special:Search URL", () => {
    expect(wikipediaSearchUrl("Jane Doe")).toBe(
      "https://en.wikipedia.org/wiki/Special:Search?search=Jane%20Doe"
    );
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
});
