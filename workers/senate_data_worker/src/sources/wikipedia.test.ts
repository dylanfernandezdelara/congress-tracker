import { describe, expect, it } from "vitest";
import {
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
