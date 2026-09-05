import { describe, expect, it } from "vitest";
import {
  classifyChamberWarningSeverity,
  evaluateIngestMonitorStatus,
  isChamberHardSkipWarning,
  isDegradedChamberWarning,
  isIngestMonitorHealthy,
  isIngestMonitorOpsAcceptable,
  isIntroListFailureWarning,
  isIngestTruncationWarning,
  isSenateCacheFallbackWarning,
} from "./ingest-monitor-status";

describe("ingest monitor status helpers", () => {
  it("treats only ok as fully healthy", () => {
    expect(isIngestMonitorHealthy("ok")).toBe(true);
    expect(isIngestMonitorHealthy("degraded")).toBe(false);
    expect(isIngestMonitorHealthy("failed")).toBe(false);
    expect(isIngestMonitorHealthy("stale")).toBe(false);
    expect(isIngestMonitorHealthy("unknown")).toBe(false);
    expect(isIngestMonitorHealthy(null)).toBe(false);
  });

  it("allows ok and degraded for ops automation", () => {
    expect(isIngestMonitorOpsAcceptable("ok")).toBe(true);
    expect(isIngestMonitorOpsAcceptable("degraded")).toBe(true);
    expect(isIngestMonitorOpsAcceptable("failed")).toBe(false);
    expect(isIngestMonitorOpsAcceptable("stale")).toBe(false);
    expect(isIngestMonitorOpsAcceptable("unknown")).toBe(false);
    expect(isIngestMonitorOpsAcceptable(undefined)).toBe(false);
  });

  it("classifies chamber warnings: hard skip pages, cache fallback degrades", () => {
    expect(classifyChamberWarningSeverity([])).toBe("none");
    expect(
      classifyChamberWarningSeverity([
        "Senate vote menu served from D1 cache after live fetch failed: HTTP 403",
      ])
    ).toBe("degraded");
    expect(
      classifyChamberWarningSeverity(["House ingest skipped: Congress API down"])
    ).toBe("failed");
    expect(
      classifyChamberWarningSeverity([
        "Senate vote menu served from D1 cache after live fetch failed: HTTP 403",
        "House ingest skipped: Congress API down",
      ])
    ).toBe("failed");
    expect(classifyChamberWarningSeverity(["some other soft warning"])).toBe("failed");
    expect(
      classifyChamberWarningSeverity([
        "House ingest truncated: per-run fetch cap reached; remaining unknown rolls retry next run (newest first).",
      ])
    ).toBe("degraded");
    expect(
      classifyChamberWarningSeverity([
        "Senate vote menu served from D1 cache after live fetch failed: HTTP 403",
        "House ingest truncated: per-run fetch cap reached; remaining unknown rolls retry next run (newest first).",
      ])
    ).toBe("degraded");
    expect(
      classifyChamberWarningSeverity([
        "House ingest truncated: per-run fetch cap reached; remaining unknown rolls retry next run (newest first).",
        "House source listed latest 2026-08-10 is newer than stored 2026-07-23",
      ])
    ).toBe("failed");
    expect(isSenateCacheFallbackWarning("Senate vote menu served from D1 cache after live fetch failed: x")).toBe(
      true
    );
    expect(isChamberHardSkipWarning("Senate ingest skipped: 403")).toBe(true);
    expect(
      isIngestTruncationWarning(
        "House ingest truncated: per-run fetch cap reached; remaining unknown rolls retry next run (newest first)."
      )
    ).toBe(true);
    expect(
      isDegradedChamberWarning(
        "House ingest truncated: per-run fetch cap reached; remaining unknown rolls retry next run (newest first)."
      )
    ).toBe(true);
    expect(
      isDegradedChamberWarning("Senate vote menu served from D1 cache after live fetch failed: x")
    ).toBe(true);
    expect(
      isDegradedChamberWarning("House source listed latest 2026-08-10 is newer than stored 2026-07-23")
    ).toBe(false);
    expect(isIntroListFailureWarning("Intro list failed: HTTP 429")).toBe(true);
    expect(isIntroListFailureWarning("S. 9901: upsert failed")).toBe(false);
    expect(isIntroListFailureWarning("HTTP 429")).toBe(false);
  });
});

describe("evaluateIngestMonitorStatus intro discovery", () => {
  const now = new Date("2026-06-23T12:00:00.000Z");
  const scheduledSuccess = {
    completed_at: "2026-06-23T10:05:00.000Z",
    trigger: "scheduled" as const,
  };

  it("stays ok when intro warnings are empty or unprefixed", () => {
    expect(
      evaluateIngestMonitorStatus({
        now,
        staleAfterHours: 26,
        scheduledSuccess,
        lastFailure: null,
        introWarnings: [],
      }).status
    ).toBe("ok");
    expect(
      evaluateIngestMonitorStatus({
        now,
        staleAfterHours: 26,
        scheduledSuccess,
        lastFailure: null,
        introWarnings: ["HTTP 429"],
      }).status
    ).toBe("ok");
    expect(
      evaluateIngestMonitorStatus({
        now,
        staleAfterHours: 26,
        scheduledSuccess,
        lastFailure: null,
        introWarnings: ["S. 9901: upsert failed"],
      }).status
    ).toBe("ok");
    expect(
      evaluateIngestMonitorStatus({
        now,
        staleAfterHours: 26,
        scheduledSuccess,
        lastFailure: null,
      }).status
    ).toBe("ok");
  });

  it("marks degraded when feed-visible bills are missing complete digests", () => {
    const result = evaluateIngestMonitorStatus({
      now,
      staleAfterHours: 26,
      scheduledSuccess,
      lastFailure: null,
      missingDigestCount: 14,
    });
    expect(result.status).toBe("degraded");
    expect(result.message).toBe("Scheduled ingest completed within the expected window.");
  });

  it("marks degraded on Intro list failed: prefix", () => {
    const result = evaluateIngestMonitorStatus({
      now,
      staleAfterHours: 26,
      scheduledSuccess,
      lastFailure: null,
      introWarnings: ["Intro list failed: HTTP 429"],
    });
    expect(result.status).toBe("degraded");
    expect(result.message).toContain("Intro discovery soft-failed");
    expect(result.message).toContain("HTTP 429");
  });
});
