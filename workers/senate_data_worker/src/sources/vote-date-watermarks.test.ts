import { describe, expect, it } from "vitest";

import { createVoteDateWatermarks } from "./vote-date-watermarks";

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
});
