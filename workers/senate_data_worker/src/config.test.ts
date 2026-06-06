import { describe, expect, it } from "vitest";

import { parseIntSafe } from "./config";

describe("parseIntSafe", () => {
  it("returns fallback for missing or invalid values", () => {
    expect(parseIntSafe(undefined, 36)).toBe(36);
    expect(parseIntSafe("not-a-number", 12)).toBe(12);
  });

  it("parses integers", () => {
    expect(parseIntSafe("119", 0)).toBe(119);
  });
});
