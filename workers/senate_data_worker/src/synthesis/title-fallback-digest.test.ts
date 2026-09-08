import { describe, expect, it } from "vitest";
import { DIGEST_SOURCE_TITLE_FALLBACK } from "../../../../shared/digest-api-types";
import { parseStoredDigest } from "../d1/digests";
import { buildTitleFallbackDigest } from "./title-fallback-digest";

describe("buildTitleFallbackDigest", () => {
  it("restates a title-only bill without inventing CRS content", () => {
    const digest = buildTitleFallbackDigest({
      title: "Equal Pay for Equal Work Act",
      policyArea: null,
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
    expect(parseStoredDigest(JSON.stringify(digest))).not.toBeNull();
  });

  it("keeps the lead to one sentence and lists the policy area as a key point", () => {
    const digest = buildTitleFallbackDigest({
      title: "To amend title 38, United States Code, to improve care, and for other purposes.",
      policyArea: "Armed Forces and National Security",
      rawSummary: null,
    });

    expect(digest?.headline).toBe("To amend title 38, United States Code, to improve care");
    expect(digest?.what_it_does).toBe(
      'This measure is titled "To amend title 38, United States Code, to improve care" and does not yet have an official summary.'
    );
    expect(digest?.what_it_does.match(/[.!?](\s|$)/g)).toHaveLength(1);
    expect(digest?.key_points).toEqual(["Policy area: Armed Forces and National Security"]);
  });

  it("uses the CRS opening sentence when official text exists", () => {
    const digest = buildTitleFallbackDigest({
      title: "Springfield Post Office Act",
      policyArea: "Government Operations and Politics",
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
    expect(buildTitleFallbackDigest({ title: "  ", policyArea: "Health", rawSummary: null })).toBeNull();
    expect(buildTitleFallbackDigest({ title: null, policyArea: null, rawSummary: "" })).toBeNull();
  });

  it("falls back to the CRS lead as headline when the title is missing", () => {
    const digest = buildTitleFallbackDigest({
      title: null,
      policyArea: null,
      rawSummary: "This resolution honors the 2026 champions. It commends the coaching staff.",
    });

    expect(digest?.headline).toBe("This resolution honors the 2026 champions.");
    expect(digest?.what_it_does).toBe("This resolution honors the 2026 champions.");
  });
});
