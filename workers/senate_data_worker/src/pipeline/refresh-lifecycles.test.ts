import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LifecycleRow } from "../d1/lifecycle";
import { resetSchemaFlag } from "../d1/schema";
import {
  lifecycleRefreshPriority,
  mergeLifecycleRefreshCandidates,
  refreshBillLifecycles,
} from "./refresh-lifecycles";

const mockSelectPresentedPending = vi.fn();
const mockGetLifecyclesForBills = vi.fn();
const mockUpsertLifecycle = vi.fn();
const mockFetchBillLifecycleSource = vi.fn();

vi.mock("../d1/lifecycle", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../d1/lifecycle")>();
  return {
    ...actual,
    selectPresentedPendingLifecycleBills: (...args: unknown[]) =>
      mockSelectPresentedPending(...args),
    getLifecyclesForBills: (...args: unknown[]) => mockGetLifecyclesForBills(...args),
    upsertLifecycle: (...args: unknown[]) => mockUpsertLifecycle(...args),
  };
});

vi.mock("../sources/congress-client", () => ({
  fetchBillLifecycleSource: (...args: unknown[]) => mockFetchBillLifecycleSource(...args),
}));

vi.mock("../constants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../constants")>();
  return {
    ...actual,
    LIFECYCLE_MAX_REFRESHES_PER_RUN: 1,
  };
});

function row(partial: Partial<LifecycleRow>): LifecycleRow {
  return {
    congress: 119,
    bill_type: "HR",
    bill_number: 1,
    introduced_date: null,
    presented_date: null,
    signed_date: null,
    vetoed_date: null,
    became_law_date: null,
    law_kind: null,
    public_law: null,
    latest_action_date: null,
    latest_action_text: null,
    updated_at: "2026-07-01T00:00:00.000Z",
    ...partial,
  };
}

describe("lifecycleRefreshPriority", () => {
  it("prefers never-refreshed bills, then presidential-tracking, then the rest", () => {
    expect(lifecycleRefreshPriority(undefined)).toBe(0);
    expect(lifecycleRefreshPriority(row({ presented_date: "2026-06-29" }))).toBe(1);
    expect(lifecycleRefreshPriority(row({ vetoed_date: "2026-05-01", law_kind: "vetoed" }))).toBe(
      1
    );
    expect(lifecycleRefreshPriority(row({ introduced_date: "2026-01-01" }))).toBe(2);
  });
});

describe("mergeLifecycleRefreshCandidates", () => {
  it("includes presented-not-terminal bills outside the vote lookback and dedupes", () => {
    const merged = mergeLifecycleRefreshCandidates(
      [{ bill_congress: 119, bill_type: "HR", bill_number: 10 }],
      [
        { bill_congress: 119, bill_type: "HR", bill_number: 10 },
        { bill_congress: 119, bill_type: "S", bill_number: 6644 },
      ]
    );
    expect(merged).toEqual([
      { bill_congress: 119, bill_type: "HR", bill_number: 10 },
      { bill_congress: 119, bill_type: "S", bill_number: 6644 },
    ]);
  });
});

describe("refreshBillLifecycles", () => {
  beforeEach(() => {
    resetSchemaFlag();
    mockSelectPresentedPending.mockReset();
    mockGetLifecyclesForBills.mockReset();
    mockUpsertLifecycle.mockReset();
    mockFetchBillLifecycleSource.mockReset();
  });

  it("refreshes a presented-not-terminal bill outside the vote lookback", async () => {
    mockSelectPresentedPending.mockResolvedValue([
      { bill_congress: 119, bill_type: "HR", bill_number: 6644 },
    ]);
    mockGetLifecyclesForBills.mockResolvedValue(
      new Map([
        [
          "119:HR:6644",
          row({
            bill_number: 6644,
            presented_date: "2026-01-01",
            became_law_date: null,
          }),
        ],
      ])
    );
    mockFetchBillLifecycleSource.mockResolvedValue({
      introducedDate: "2025-12-01",
      milestones: {
        presented_date: "2026-01-01",
        signed_date: "2026-01-12",
        vetoed_date: null,
        became_law_date: "2026-01-12",
        law_kind: "signed",
        public_law: "119-42",
        latest_action_date: "2026-01-12",
        latest_action_text: "Became Public Law No: 119-42.",
      },
    });
    mockUpsertLifecycle.mockResolvedValue(undefined);

    const result = await refreshBillLifecycles(
      { DB: {} as D1Database } as never,
      [],
      "test"
    );

    expect(result.refreshed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(mockFetchBillLifecycleSource).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ congress: 119, type: "HR", number: 6644 })
    );
    expect(mockUpsertLifecycle).toHaveBeenCalled();
  });

  it("skips terminal bills and respects the per-run refresh cap", async () => {
    mockSelectPresentedPending.mockResolvedValue([
      { bill_congress: 119, bill_type: "HR", bill_number: 1 },
      { bill_congress: 119, bill_type: "S", bill_number: 2 },
    ]);
    mockGetLifecyclesForBills.mockResolvedValue(
      new Map([
        [
          "119:HR:1",
          row({
            bill_number: 1,
            presented_date: "2026-01-01",
            became_law_date: "2026-01-10",
            law_kind: "signed",
            public_law: "119-1",
          }),
        ],
        [
          "119:S:2",
          row({
            bill_type: "S",
            bill_number: 2,
            presented_date: "2026-02-01",
            became_law_date: null,
          }),
        ],
        [
          "119:HR:3",
          row({
            bill_number: 3,
            presented_date: "2026-03-01",
            became_law_date: null,
          }),
        ],
      ])
    );
    mockFetchBillLifecycleSource.mockResolvedValue({
      introducedDate: null,
      milestones: {
        presented_date: "2026-02-01",
        signed_date: null,
        vetoed_date: null,
        became_law_date: null,
        law_kind: null,
        public_law: null,
        latest_action_date: "2026-02-01",
        latest_action_text: "Presented to President.",
      },
    });
    mockUpsertLifecycle.mockResolvedValue(undefined);

    const result = await refreshBillLifecycles(
      { DB: {} as D1Database } as never,
      [{ bill_congress: 119, bill_type: "HR", bill_number: 3 }],
      "test"
    );

    expect(mockFetchBillLifecycleSource).toHaveBeenCalledTimes(1);
    expect(result.refreshed).toBe(1);
    expect(result.skipped).toBe(2);
  });
});
