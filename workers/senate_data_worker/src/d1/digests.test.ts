import { describe, expect, it } from "vitest";
import {
  DIGEST_SOURCE_TITLE_FALLBACK,
  classifyDigestPhase,
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

const fallbackJson = JSON.stringify({
  headline: "Done",
  what_it_does: "Works",
  source: DIGEST_SOURCE_TITLE_FALLBACK,
});

describe("classifyDigestPhase", () => {
  it("routes missing, fallback, title-only, and CRS-backed rows to distinct phases", () => {
    expect(classifyDigestPhase(null)).toBe("incomplete");
    expect(classifyDigestPhase({ digest_json: null, raw_summary_text: "CRS" })).toBe("incomplete");
    expect(classifyDigestPhase({ digest_json: fallbackJson, raw_summary_text: null })).toBe(
      "fallback_upgrade"
    );
    expect(classifyDigestPhase({ digest_json: fallbackJson, raw_summary_text: "CRS" })).toBe(
      "fallback_upgrade"
    );
    expect(
      classifyDigestPhase({
        digest_json: JSON.stringify({ headline: "Done", what_it_does: "Works" }),
        raw_summary_text: null,
      })
    ).toBe("crs_upgrade");
    expect(
      classifyDigestPhase({
        digest_json: JSON.stringify({ headline: "Done", what_it_does: "Works" }),
        raw_summary_text: "CRS",
      })
    ).toBe("complete");
  });
});

describe("needsCrsUpgrade", () => {
  it("is false for a title fallback so it retries regardless of CRS", () => {
    expect(needsCrsUpgrade({ digest_json: fallbackJson, raw_summary_text: null })).toBe(false);
  });

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
  it("strips the worker-only fallback marker from the public digest", () => {
    expect(parseStoredDigest(fallbackJson)).toEqual({ headline: "Done", what_it_does: "Works" });
  });

  it("requires headline and what_it_does", () => {
    expect(parseStoredDigest(JSON.stringify({ headline: "Done" }))).toBeNull();
    expect(
      parseStoredDigest(JSON.stringify({ headline: "Done", what_it_does: "Works" }))
    ).not.toBeNull();
  });
});
