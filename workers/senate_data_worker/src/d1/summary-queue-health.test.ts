import { describe, expect, it } from "vitest";
import { summaryQueueMonitor } from "./digest-jobs";

const now = new Date("2026-11-26T21:00:00.000Z");

describe("summaryQueueMonitor", () => {
  it("is stalled when bills waited past a day and nothing was written (the Nov 2026 spent-key stall)", () => {
    expect(
      summaryQueueMonitor(
        { queued: 572, oldest: "2026-10-23T09:38:54.740Z", blocked: 0, lastWritten: "2026-11-10T06:35:52.772Z" },
        now
      )
    ).toMatchObject({ queued: 572, stalled: true });
  });

  it("is stalled whenever account or model errors block jobs", () => {
    expect(
      summaryQueueMonitor({ queued: 3, oldest: "2026-11-26T20:00:00.000Z", blocked: 3, lastWritten: "2026-11-26T20:30:00.000Z" }, now)
        .stalled
    ).toBe(true);
  });

  it("is healthy while summaries keep being written, even with an old backlog", () => {
    expect(
      summaryQueueMonitor({ queued: 400, oldest: "2026-11-01T00:00:00.000Z", blocked: 0, lastWritten: "2026-11-26T20:35:00.000Z" }, now)
        .stalled
    ).toBe(false);
    expect(summaryQueueMonitor({ queued: 0, oldest: null, blocked: 0, lastWritten: "2026-11-01T00:00:00.000Z" }, now).stalled).toBe(false);
  });
});
