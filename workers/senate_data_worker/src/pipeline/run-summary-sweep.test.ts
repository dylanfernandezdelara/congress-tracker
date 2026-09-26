import { beforeEach, describe, expect, it, vi } from "vitest";

const select = vi.fn();
const mark = vi.fn();
const refresh = vi.fn();
const resolveModel = vi.fn(async () => "test-model");

vi.mock("../d1/digests", () => ({
  selectSummarySweepCandidates: (...args: unknown[]) => select(...args),
  markSummaryChecked: (...args: unknown[]) => mark(...args),
}));
vi.mock("./refresh-feed-digests", () => ({ refreshFeedDigests: (...args: unknown[]) => refresh(...args) }));
vi.mock("../synthesis/model", () => ({ resolveOpenRouterModel: () => resolveModel() }));

import { SUMMARY_SWEEP_MAX_BILLS_PER_RUN } from "../constants";
import { runSummarySweep } from "./run-summary-sweep";
import { createMockEnv } from "../http/test-fixtures";

const now = new Date("2026-09-26T12:00:00.000Z");
const env = () => createMockEnv({ CONGRESS: "119" }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  mark.mockResolvedValue(undefined);
  refresh.mockResolvedValue({ written: 2, skipped: 0, rewritten: 2, warnings: [] });
});

describe("runSummarySweep", () => {
  it("re-checks due bills through the digest phases and records the check", async () => {
    const bills = [
      { congress: 119, bill_type: "HR", number: 1 },
      { congress: 119, bill_type: "HR", number: 10516 },
    ];
    select.mockResolvedValue(bills);

    const result = await runSummarySweep(env(), { now });

    expect(select).toHaveBeenCalledWith(expect.anything(), {
      congress: 119,
      checkedBeforeIso: "2026-09-25T12:00:00.000Z",
      limit: SUMMARY_SWEEP_MAX_BILLS_PER_RUN,
    });
    expect(refresh).toHaveBeenCalledWith(
      expect.anything(),
      [
        { bill_congress: 119, bill_type: "HR", bill_number: 1 },
        { bill_congress: 119, bill_type: "HR", bill_number: 10516 },
      ],
      "test-model"
    );
    expect(mark).toHaveBeenCalledWith(expect.anything(), bills, now.toISOString());
    expect(result).toEqual({ checked: 2, written: 2, skipped: 0, rewritten: 2, warnings: [] });
  });

  it("does nothing, and resolves no model, when no bill is due", async () => {
    select.mockResolvedValue([]);
    expect(await runSummarySweep(env(), { now })).toEqual({ checked: 0, written: 0, rewritten: 0, skipped: 0, warnings: [] });
    expect(resolveModel).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("reports a failure instead of throwing, so the hourly job it rides on still completes", async () => {
    select.mockResolvedValue([{ congress: 119, bill_type: "HR", number: 1 }]);
    refresh.mockRejectedValue(new Error("D1 unavailable"));
    const result = await runSummarySweep(env(), { now });
    expect(result.warnings).toEqual(["summary sweep failed: D1 unavailable"]);
    expect(mark).not.toHaveBeenCalled();
  });

  it("uses a caller's limit", async () => {
    select.mockResolvedValue([]);
    await runSummarySweep(env(), { now, limit: 40 });
    expect(select.mock.calls[0]![1].limit).toBe(40);
  });
});
