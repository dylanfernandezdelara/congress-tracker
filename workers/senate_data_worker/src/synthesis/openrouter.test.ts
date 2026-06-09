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

  it("returns null for invalid JSON", () => {
    expect(parseDigestJson("not json")).toBeNull();
  });
});
