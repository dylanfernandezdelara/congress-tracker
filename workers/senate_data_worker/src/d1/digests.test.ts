import { describe, expect, it } from "vitest";
import { hasDigestRewriteSource, parseStoredDigest } from "./digests";

describe("hasDigestRewriteSource", () => {
  it("accepts a title when CRS text is missing", () => {
    expect(hasDigestRewriteSource({ title: "A bill", rawSummaryText: null })).toBe(true);
  });

  it("accepts CRS text when the title is missing", () => {
    expect(hasDigestRewriteSource({ title: null, rawSummary: "CRS summary" })).toBe(true);
  });

  it("rejects blank title and blank CRS", () => {
    expect(hasDigestRewriteSource({ title: "  ", rawSummaryText: "" })).toBe(false);
    expect(hasDigestRewriteSource({ title: null, rawSummary: null })).toBe(false);
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
