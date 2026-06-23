import { describe, expect, it } from "vitest";
import {
  DIGEST_BULLET_MAX_WORDS,
  DIGEST_MAX_BULLETS,
} from "../../../../shared/feed-content";
import { parseDigestJson } from "./openrouter";

describe("parseDigestJson", () => {
  it("parses valid digest JSON", () => {
    const parsed = parseDigestJson(
      JSON.stringify({
        headline: "Test headline here",
        what_it_does: "It does something plain.",
        key_points: ["one", "two"],
        terms_explained: [{ term: "FAA", plain: "aviation agency" }],
      })
    );
    expect(parsed?.headline).toBe("Test headline here");
    expect(parsed?.key_points).toHaveLength(2);
  });

  it("reduces what_it_does to its first sentence", () => {
    const parsed = parseDigestJson(
      JSON.stringify({
        headline: "Test headline here",
        what_it_does:
          "This bill blocks aid for ghost students. It also creates reporting rules and audit requirements for schools.",
        key_points: ["one", "two"],
        terms_explained: [{ term: "FAA", plain: "aviation agency" }],
      })
    );
    expect(parsed?.what_it_does).toBe("This bill blocks aid for ghost students.");
  });

  it("keeps normal-length bullets intact", () => {
    const bullet =
      "Requires annual enrollment verification from participating institutions";
    const parsed = parseDigestJson(
      JSON.stringify({
        headline: "Test headline here",
        what_it_does: "Does a thing.",
        key_points: [bullet, "two"],
        terms_explained: [],
      })
    );
    expect(parsed?.key_points[0]).toBe(bullet);
    expect(parsed?.key_points).toHaveLength(2);
  });

  it("truncates over-long bullets at the word cap and limits bullet count", () => {
    const longBullet = Array.from(
      { length: DIGEST_BULLET_MAX_WORDS + 10 },
      (_, index) => `word${index}`
    ).join(" ");
    const extraBullets = Array.from(
      { length: DIGEST_MAX_BULLETS + 3 },
      (_, index) => `bullet ${index}`
    );
    const parsed = parseDigestJson(
      JSON.stringify({
        headline: "Test headline here",
        what_it_does: "Does a thing.",
        key_points: [longBullet, ...extraBullets],
        terms_explained: [],
      })
    );
    expect(parsed?.key_points[0].endsWith("…")).toBe(true);
    expect(parsed?.key_points[0].split(" ")).toHaveLength(DIGEST_BULLET_MAX_WORDS);
    expect(parsed?.key_points).toHaveLength(DIGEST_MAX_BULLETS);
  });

  it("returns null for invalid JSON", () => {
    expect(parseDigestJson("not json")).toBeNull();
  });
});
