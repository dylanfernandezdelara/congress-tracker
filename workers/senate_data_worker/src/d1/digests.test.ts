import { describe, expect, it } from "vitest";
import { DIGEST_SOURCE_TITLE_FALLBACK } from "../../../../shared/digest-api-types";
import {
  hasDigestRewriteSource,
  isTitleFallbackDigest,
  needsCrsUpgrade,
  parseStoredDigest,
} from "./digests";

describe("isTitleFallbackDigest", () => {
  it("is true only for parseable digests carrying the fallback source marker", () => {
    expect(
      isTitleFallbackDigest(
        JSON.stringify({
          headline: "Done",
          what_it_does: "Works",
          source: DIGEST_SOURCE_TITLE_FALLBACK,
        })
      )
    ).toBe(true);
    expect(
      isTitleFallbackDigest(JSON.stringify({ headline: "Done", what_it_does: "Works" }))
    ).toBe(false);
    expect(
      isTitleFallbackDigest(JSON.stringify({ headline: "Done", source: DIGEST_SOURCE_TITLE_FALLBACK }))
    ).toBe(false);
    expect(isTitleFallbackDigest(null)).toBe(false);
  });
});

describe("hasDigestRewriteSource", () => {
  it("accepts a title when CRS text is missing", () => {
    expect(hasDigestRewriteSource({ title: "A bill", rawSummary: null })).toBe(true);
  });

  it("accepts CRS text when the title is missing", () => {
    expect(hasDigestRewriteSource({ title: null, rawSummary: "CRS summary" })).toBe(true);
  });

  it("rejects blank title and blank CRS", () => {
    expect(hasDigestRewriteSource({ title: "  ", rawSummary: "" })).toBe(false);
    expect(hasDigestRewriteSource({ title: null, rawSummary: null })).toBe(false);
  });
});

describe("needsCrsUpgrade", () => {
  it("is true for a complete title-only digest", () => {
    expect(
      needsCrsUpgrade({
        digest_json: JSON.stringify({ headline: "Done", what_it_does: "Works" }),
        raw_summary_text: null,
      })
    ).toBe(true);
  });

  it("is false when CRS text is already stored", () => {
    expect(
      needsCrsUpgrade({
        digest_json: JSON.stringify({ headline: "Done", what_it_does: "Works" }),
        raw_summary_text: "CRS",
      })
    ).toBe(false);
  });
});

describe("parseStoredDigest", () => {
  it("requires headline and what_it_does", () => {
    expect(parseStoredDigest(JSON.stringify({ headline: "Done" }))).toBeNull();
    expect(
      parseStoredDigest(JSON.stringify({ headline: "Done", what_it_does: "Works" }))
    ).not.toBeNull();
  });
});
