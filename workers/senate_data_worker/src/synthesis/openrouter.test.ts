import { describe, expect, it } from "vitest";
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

  it("normalizes long what_it_does to one sentence and trims bullets", () => {
    const parsed = parseDigestJson(
      JSON.stringify({
        headline: "Test headline here",
        what_it_does:
          "This bill blocks aid for ghost students. It also creates reporting rules and audit requirements for schools.",
        key_points: [
          "Requires annual enrollment verification from every participating institution nationwide including online-only schools and satellite campuses",
          "two",
        ],
        terms_explained: [{ term: "FAA", plain: "aviation agency" }],
      })
    );
    expect(parsed?.what_it_does).toBe("This bill blocks aid for ghost students.");
    expect(parsed?.key_points[0]).toMatch(/…$/);
    expect(parsed?.key_points).toHaveLength(2);
  });

  it("returns null for invalid JSON", () => {
    expect(parseDigestJson("not json")).toBeNull();
  });
});
