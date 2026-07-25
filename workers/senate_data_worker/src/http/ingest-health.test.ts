import { describe, expect, it } from "vitest";
import { buildIngestMonitorPayload, evaluateIngestMonitorStatus } from "./ingest-health";

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
        error: "HTTP 403 for https://api.congress.gov/v3/bill/119/hr/1?format=json&api_key=secret",
      },
    });
    expect(result.status).toBe("failed");
    expect(result.message).not.toContain("secret");
    expect(result.message).toContain("api.congress.gov");
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

describe("buildIngestMonitorPayload", () => {
  const now = new Date("2026-06-23T12:00:00.000Z");

  it("surfaces last_skipped without changing status fields", () => {
    const skipped = {
      skipped_at: "2026-06-23T10:00:35.000Z",
      trigger: "scheduled" as const,
      reason: "pipeline_busy" as const,
    };
    const lastScheduled = {
      completed_at: "2026-06-20T10:05:00.000Z",
      trigger: "scheduled" as const,
      votesUpserted: 1,
      votesSkipped: 0,
      billsSelected: 1,
      digestsWritten: 1,
      digestsSkipped: 0,
    };
    const payload = buildIngestMonitorPayload({
      now,
      staleAfterHours: 26,
      dailyCronUtc: "0 10 * * *",
      latestPassageVoteDate: "2026-06-20",
      missingDigestCount: 0,
      lastSuccess: lastScheduled,
      lastScheduledSuccess: lastScheduled,
      lastFailure: null,
      lastSkipped: skipped,
    });

    expect(payload.status).toBe("stale");
    expect(payload.last_skipped).toEqual(skipped);
    expect(payload.last_scheduled_success?.completed_at).toBe(lastScheduled.completed_at);
    expect(payload.last_failure).toBeNull();
  });

  it("defaults last_skipped to null when absent", () => {
    const payload = buildIngestMonitorPayload({
      now,
      staleAfterHours: 26,
      dailyCronUtc: "0 10 * * *",
      latestPassageVoteDate: null,
      missingDigestCount: 0,
      lastSuccess: null,
      lastFailure: null,
    });
    expect(payload.last_skipped).toBeNull();
    expect(payload.status).toBe("unknown");
  });
});
