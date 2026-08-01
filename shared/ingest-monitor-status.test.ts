import { describe, expect, it } from "vitest";
import {
  classifyChamberWarningSeverity,
  isChamberHardSkipWarning,
  isIngestMonitorHealthy,
  isIngestMonitorOpsAcceptable,
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
    expect(isSenateCacheFallbackWarning("Senate vote menu served from D1 cache after live fetch failed: x")).toBe(
      true
    );
    expect(isChamberHardSkipWarning("Senate ingest skipped: 403")).toBe(true);
  });
});
