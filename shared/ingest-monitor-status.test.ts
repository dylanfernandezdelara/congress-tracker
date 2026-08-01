import { describe, expect, it } from "vitest";
import {
  isIngestMonitorHealthy,
  isIngestMonitorOpsAcceptable,
} from "./ingest-monitor-status.mjs";

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
});
