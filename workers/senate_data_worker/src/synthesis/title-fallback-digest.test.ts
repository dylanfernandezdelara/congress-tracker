import { describe, expect, it } from "vitest";
import { formatCollapsedDigestLead } from "../../../../shared/feed-content";
import {
  DIGEST_SOURCE_TITLE_FALLBACK,
  isTitleFallbackDigest,
  parseStoredDigest,
} from "../d1/digests";
import { buildTitleFallbackDigest } from "./title-fallback-digest";

describe("buildTitleFallbackDigest", () => {
  it("restates a title-only bill without inventing CRS content", () => {
    const digest = buildTitleFallbackDigest({
      title: "Equal Pay for Equal Work Act",
      rawSummary: null,
    });

    expect(digest).toEqual({
      headline: "Equal Pay for Equal Work Act",
      what_it_does:
        'This measure is titled "Equal Pay for Equal Work Act" and does not yet have an official summary.',
      key_points: [],
      terms_explained: [],
      source: DIGEST_SOURCE_TITLE_FALLBACK,
    });
    const json = JSON.stringify(digest);
    expect(parseStoredDigest(json)).not.toBeNull();
    expect(isTitleFallbackDigest(json)).toBe(true);
  });

  it("strips boilerplate and trailing punctuation from the title", () => {
    const digest = buildTitleFallbackDigest({
      title: "To amend title 38, United States Code, to improve care, and for other purposes.",
      rawSummary: null,
    });

    expect(digest?.headline).toBe("To amend title 38, United States Code, to improve care");
    expect(digest?.what_it_does).toBe(
      'This measure is titled "To amend title 38, United States Code, to improve care" and does not yet have an official summary.'
    );
  });

  it("keeps the whole templated lead when the title contains abbreviations", () => {
    for (const title of [
      "St. Croix National Heritage Area Act",
      "Martin Luther King, Jr. Memorial Post Office Act",
      "Mt. Hood Cooperative Recreation Enhancement Act",
      "Ft. Worth Veterans Clinic Act",
    ]) {
      const digest = buildTitleFallbackDigest({ title, rawSummary: null });
      const expected = `This measure is titled "${title}" and does not yet have an official summary.`;
      expect(digest?.what_it_does).toBe(expected);
      expect(formatCollapsedDigestLead(digest?.what_it_does ?? "")).toBe(expected);
    }
  });

  it("uses the CRS opening sentence when official text exists", () => {
    const digest = buildTitleFallbackDigest({
      title: "Springfield Post Office Act",
      rawSummary:
        "This bill designates the facility in Springfield as the Example Post Office. It also directs signage changes.",
    });

    expect(digest?.headline).toBe("Springfield Post Office Act");
    expect(digest?.what_it_does).toBe(
      "This bill designates the facility in Springfield as the Example Post Office."
    );
    expect(digest?.source).toBe(DIGEST_SOURCE_TITLE_FALLBACK);
  });

  it("returns null when neither title nor CRS text exists", () => {
    expect(buildTitleFallbackDigest({ title: "  ", rawSummary: null })).toBeNull();
    expect(buildTitleFallbackDigest({ title: null, rawSummary: "" })).toBeNull();
  });

  it("falls back to the CRS lead as headline when the title is missing", () => {
    const digest = buildTitleFallbackDigest({
      title: null,
      rawSummary: "This resolution honors the 2026 champions. It commends the coaching staff.",
    });

    expect(digest?.headline).toBe("This resolution honors the 2026 champions.");
    expect(digest?.what_it_does).toBe("This resolution honors the 2026 champions.");
  });
});
