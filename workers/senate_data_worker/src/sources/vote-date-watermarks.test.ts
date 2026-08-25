import { describe, expect, it } from "vitest";

import { createVoteDateWatermarks, isSourceAheadOfCovered } from "./vote-date-watermarks";

describe("createVoteDateWatermarks", () => {
  it("keeps listed ahead of covered and omits empty fields", () => {
    const watermarks = createVoteDateWatermarks();
    expect(watermarks.toFields()).toEqual({});

    watermarks.noteListed("2026-08-10T16:00:00.000Z");
    watermarks.noteListed("2026-07-23");
    watermarks.noteCovered("2026-07-23");
    expect(watermarks.toFields()).toEqual({
      sourceLatestDate: "2026-08-10",
      coveredLatestDate: "2026-07-23",
    });
  });

  it("treats menu rows as listed and covered together", () => {
    const watermarks = createVoteDateWatermarks();
    watermarks.noteListedAndCovered("2026-08-08T16:00:00.000Z");
    expect(watermarks.toFields()).toEqual({
      sourceLatestDate: "2026-08-08",
      coveredLatestDate: "2026-08-08",
    });
  });
});

describe("isSourceAheadOfCovered", () => {
  it("is true only when a listed day is missing from covered", () => {
    expect(isSourceAheadOfCovered("2026-08-10", "2026-07-23")).toBe(true);
    expect(isSourceAheadOfCovered("2026-08-10", undefined)).toBe(true);
    expect(isSourceAheadOfCovered("2026-07-23", "2026-07-23")).toBe(false);
    expect(isSourceAheadOfCovered(undefined, "2026-07-23")).toBe(false);
  });
});
