import { describe, expect, it } from "vitest";
import { evaluateIngestMonitorStatus } from "./ingest-health";

describe("evaluateIngestMonitorStatus", () => {
  const now = new Date("2026-06-23T12:00:00.000Z");

  it("marks ok when scheduled success is recent and no newer failure", () => {
    const result = evaluateIngestMonitorStatus({
      now,
      staleAfterHours: 26,
      lastSuccess: {
        completed_at: "2026-06-23T10:05:00.000Z",
        trigger: "scheduled",
        votesUpserted: 0,
        votesSkipped: 10,
        billsSelected: 5,
        digestsWritten: 2,
        digestsSkipped: 3,
      },
      lastFailure: null,
    });
    expect(result.status).toBe("ok");
  });

  it("marks failed when failure is newer than scheduled success", () => {
    const result = evaluateIngestMonitorStatus({
      now,
      staleAfterHours: 26,
      lastSuccess: {
        completed_at: "2026-06-22T10:05:00.000Z",
        trigger: "scheduled",
        votesUpserted: 0,
        votesSkipped: 10,
        billsSelected: 5,
        digestsWritten: 0,
        digestsSkipped: 5,
      },
      lastFailure: {
        failed_at: "2026-06-23T10:05:00.000Z",
        trigger: "scheduled",
        error: "OpenRouter timeout",
      },
    });
    expect(result.status).toBe("failed");
    expect(result.message).toContain("OpenRouter timeout");
  });

  it("marks stale when scheduled success is too old", () => {
    const result = evaluateIngestMonitorStatus({
      now,
      staleAfterHours: 26,
      lastSuccess: {
        completed_at: "2026-06-20T10:05:00.000Z",
        trigger: "scheduled",
        votesUpserted: 0,
        votesSkipped: 10,
        billsSelected: 5,
        digestsWritten: 0,
        digestsSkipped: 5,
      },
      lastFailure: null,
    });
    expect(result.status).toBe("stale");
  });

  it("ignores admin failures when scheduled ingest succeeded", () => {
    const result = evaluateIngestMonitorStatus({
      now,
      staleAfterHours: 26,
      lastSuccess: {
        completed_at: "2026-06-23T10:05:00.000Z",
        trigger: "scheduled",
        votesUpserted: 0,
        votesSkipped: 10,
        billsSelected: 5,
        digestsWritten: 2,
        digestsSkipped: 3,
      },
      lastFailure: {
        failed_at: "2026-06-23T11:00:00.000Z",
        trigger: "admin",
        error: "Manual run failed",
      },
    });
    expect(result.status).toBe("ok");
  });

  it("marks unknown when no scheduled success exists", () => {
    const result = evaluateIngestMonitorStatus({
      now,
      staleAfterHours: 26,
      lastSuccess: {
        completed_at: "2026-06-23T10:05:00.000Z",
        trigger: "admin",
        votesUpserted: 1,
        votesSkipped: 0,
        billsSelected: 1,
        digestsWritten: 1,
        digestsSkipped: 0,
      },
      lastFailure: null,
    });
    expect(result.status).toBe("unknown");
  });
});
