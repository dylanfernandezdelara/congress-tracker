import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config";

const mockSelectSite = vi.fn();
const mockEnqueue = vi.fn();
const mockGetState = vi.fn();
const mockSetState = vi.fn();
const mockFetchUpdated = vi.fn();

vi.mock("../d1/digest-jobs", () => ({
  selectBackfillSiteBills: (...a: unknown[]) => mockSelectSite(...a),
  enqueueDigestJobs: (...a: unknown[]) => mockEnqueue(...a),
}));
vi.mock("../d1/pipeline-state", () => ({
  getPipelineState: (...a: unknown[]) => mockGetState(...a),
  setPipelineState: (...a: unknown[]) => mockSetState(...a),
}));
vi.mock("../sources/updated-bills", () => ({ fetchUpdatedBillsPage: (...a: unknown[]) => mockFetchUpdated(...a) }));

import { runSummaryBackfill } from "./run-summary-backfill";

const env = { CONGRESS: "119", SESSION: "2", DB: {} as D1Database, CONGRESS_API_KEY: "k", DIGEST_DAILY_BUDGET_USD: "1" } as Env;
const bill = (number: number, matters = false) => ({ congress: 119, type: "HR", number, matters });

describe("runSummaryBackfill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectSite.mockResolvedValue([bill(1, true), bill(2), bill(3)]);
    mockGetState.mockResolvedValue(null);
    mockFetchUpdated.mockResolvedValue({ bills: [], hasMore: true, total: 15_000 });
  });

  it("only counts and estimates on a dry run", async () => {
    const plan = await runSummaryBackfill(env, { scope: "site", apply: false });

    expect(plan).toMatchObject({ scope: "site", applied: false, bills: 3, matters: 1, estimatedUsd: 0.02 });
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(plan.notes[0]).toMatch(/Dry run/);
  });

  it("queues the site's bills with apply=1, up to the limit", async () => {
    const plan = await runSummaryBackfill(env, { scope: "site", apply: true, limit: 2 });

    expect(plan.bills).toBe(2);
    expect(mockEnqueue).toHaveBeenCalledWith(env.DB, [bill(1, true), bill(2)], "new");
  });

  it("estimates a whole-Congress backfill from Congress.gov's count and starts the walk only with apply=1", async () => {
    const dry = await runSummaryBackfill(env, { scope: "congress", apply: false });
    expect(dry).toMatchObject({ bills: 15_000, matters: 1 });
    expect(dry.estimatedUsd).toBeCloseTo(14_999 * 0.0009 + 0.014, 1);
    // Budget-bound: ~$13.5 at half of $1/day.
    expect(dry.estimatedDays).toBeGreaterThan(20);
    expect(mockSetState).not.toHaveBeenCalled();

    await runSummaryBackfill(env, { scope: "congress", apply: true, now: new Date("2026-09-27T04:00:00Z") });
    expect(mockSetState).toHaveBeenCalledWith(env.DB, "digest_backfill_cursor", {
      congress: 119,
      offset: 0,
      done: false,
      startedAt: "2026-09-27T04:00:00.000Z",
    });
  });

  it("does not restart a walk that is already running", async () => {
    mockGetState.mockResolvedValue({ congress: 119, offset: 700, done: false, startedAt: "2026-09-26T00:00:00Z" });
    const plan = await runSummaryBackfill(env, { scope: "congress", apply: true });
    expect(mockSetState).not.toHaveBeenCalled();
    expect(plan.notes).toContain("Already running since 2026-09-26T00:00:00Z (at offset 700).");
  });
});
