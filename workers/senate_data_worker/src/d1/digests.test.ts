import { describe, expect, it } from "vitest";
import {
  DIGEST_SOURCE_TITLE_FALLBACK,
  isTitleFallbackDigest,
  parseStoredDigest,
  storedGenerator,
  wantsSummary,
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

const fallbackJson = JSON.stringify({
  headline: "Done",
  what_it_does: "Works",
  source: DIGEST_SOURCE_TITLE_FALLBACK,
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

describe("wantsSummary", () => {
  const generated = (tier: "new" | "rewrite", long = false) =>
    JSON.stringify({
      headline: "Bill would ban junk fees",
      what_it_does: "Bans fees.",
      generator: { model: "m", prompt_version: "v3", tier, text_version: null, fingerprint: "f", long, generated_at: "t" },
    });

  it("wants a summary for bills without one from the current writer", () => {
    expect(wantsSummary(null, "new")).toBe(true);
    expect(wantsSummary(fallbackJson, "new")).toBe(true);
    expect(wantsSummary(JSON.stringify({ headline: "Old", what_it_does: "Free model" }), "new")).toBe(true);
  });

  it("wants a rewrite only when a first summary now matters, never for long bills", () => {
    expect(wantsSummary(generated("new"), "new")).toBe(false);
    expect(wantsSummary(generated("new"), "rewrite")).toBe(true);
    expect(wantsSummary(generated("rewrite"), "rewrite")).toBe(false);
    expect(wantsSummary(generated("new", true), "rewrite")).toBe(false);
  });

  it("keeps the generator out of the public digest", () => {
    expect(storedGenerator(generated("new"))?.tier).toBe("new");
    expect(parseStoredDigest(generated("new"))).toEqual({ headline: "Bill would ban junk fees", what_it_does: "Bans fees." });
  });
});
