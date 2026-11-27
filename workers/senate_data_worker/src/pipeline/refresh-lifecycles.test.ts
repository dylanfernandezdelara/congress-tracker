import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LifecycleRow } from "../d1/lifecycle";
import { resetSchemaFlag } from "../d1/schema";
import {
  lifecycleRefreshPriority,
  mergeLifecycleRefreshCandidates,
  recheckStoredLaws,
  refreshBillLifecycles,
} from "./refresh-lifecycles";

const mockSelectPresentedPending = vi.fn();
const mockGetLifecyclesForBills = vi.fn();
const mockUpsertLifecycle = vi.fn();
const mockSelectLawsUpdatedBefore = vi.fn();
const mockClearLifecycleEnactment = vi.fn();
const mockFetchBillLifecycleSource = vi.fn();
const mockCountLawsUpdatedBefore = vi.fn();

vi.mock("../d1/lifecycle", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../d1/lifecycle")>();
  return {
    ...actual,
    selectPresentedPendingLifecycleBills: (...args: unknown[]) =>
      mockSelectPresentedPending(...args),
    selectLawsUpdatedBefore: (...args: unknown[]) => mockSelectLawsUpdatedBefore(...args),
    clearLifecycleEnactment: (...args: unknown[]) => mockClearLifecycleEnactment(...args),
    getLifecyclesForBills: (...args: unknown[]) => mockGetLifecyclesForBills(...args),
    upsertLifecycle: (...args: unknown[]) => mockUpsertLifecycle(...args),
    countLawsUpdatedBefore: (...args: unknown[]) => mockCountLawsUpdatedBefore(...args),
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
    // After the one-time law re-check cutoff, so rows are judged on their content alone.
    updated_at: "2026-12-01T00:00:00.000Z",
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

  it("keeps earlier groups first when merging public-law candidates", () => {
    const merged = mergeLifecycleRefreshCandidates(
      [{ bill_congress: 119, bill_type: "S", bill_number: 1003 }],
      [{ bill_congress: 119, bill_type: "HR", bill_number: 10 }],
      [{ bill_congress: 119, bill_type: "S", bill_number: 1003 }]
    );
    expect(merged).toEqual([
      { bill_congress: 119, bill_type: "S", bill_number: 1003 },
      { bill_congress: 119, bill_type: "HR", bill_number: 10 },
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
    mockSelectLawsUpdatedBefore.mockReset();
    mockSelectLawsUpdatedBefore.mockResolvedValue([]);
    mockClearLifecycleEnactment.mockReset();
    mockClearLifecycleEnactment.mockResolvedValue(undefined);
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
        unrecognized: [],
      },
    });
    mockUpsertLifecycle.mockResolvedValue(undefined);

    const result = await refreshBillLifecycles(
      { DB: {} as D1Database, CONGRESS: "119", SESSION: "2" } as never,
      [],
      "test"
    );

    expect(result.refreshed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(mockSelectPresentedPending).toHaveBeenCalledWith({}, 119, 1);
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
        unrecognized: [],
      },
    });
    mockUpsertLifecycle.mockResolvedValue(undefined);

    const result = await refreshBillLifecycles(
      { DB: {} as D1Database, CONGRESS: "119", SESSION: "2" } as never,
      [{ bill_congress: 119, bill_type: "HR", bill_number: 3 }],
      "test"
    );

    expect(mockSelectPresentedPending).toHaveBeenCalledWith({}, 119, 1);
    expect(mockFetchBillLifecycleSource).toHaveBeenCalledTimes(1);
    expect(result.refreshed).toBe(1);
    expect(result.skipped).toBe(2);
  });

  it("re-checks a law stored before the parser fix once, even though it is terminal", async () => {
    mockSelectPresentedPending.mockResolvedValue([]);
    mockSelectLawsUpdatedBefore.mockResolvedValue([{ bill_congress: 119, bill_type: "HR", bill_number: 5334 }]);
    mockGetLifecyclesForBills.mockResolvedValue(
      new Map([
        [
          "119:HR:5334",
          row({
            bill_number: 5334,
            became_law_date: "2026-09-18",
            law_kind: "law_unsigned",
            public_law: "119-111",
            updated_at: "2026-10-01T00:00:00.000Z",
          }),
        ],
      ])
    );
    mockFetchBillLifecycleSource.mockResolvedValue({
      introducedDate: null,
      milestones: {
        presented_date: "2026-09-17",
        signed_date: "2026-09-18",
        vetoed_date: null,
        became_law_date: "2026-09-18",
        law_kind: "signed",
        public_law: "119-111",
        latest_action_date: "2026-09-18",
        latest_action_text: "Became Public Law No: 119-111.",
        unrecognized: [],
      },
    });
    mockUpsertLifecycle.mockResolvedValue(undefined);

    const result = await refreshBillLifecycles(
      { DB: {} as D1Database, CONGRESS: "119", SESSION: "2" } as never,
      [],
      "test"
    );

    expect(result.refreshed).toBe(1);
    expect(mockUpsertLifecycle).toHaveBeenCalledWith({}, expect.objectContaining({ billNumber: 5334, lawKind: "signed" }));
  });

  it("clears a stored law that Congress.gov's own record does not show (H.R. 766)", async () => {
    mockSelectPresentedPending.mockResolvedValue([]);
    mockSelectLawsUpdatedBefore.mockResolvedValue([{ bill_congress: 119, bill_type: "HR", bill_number: 766 }]);
    mockGetLifecyclesForBills.mockResolvedValue(
      new Map([
        [
          "119:HR:766",
          row({
            bill_number: 766,
            became_law_date: "2025-01-28",
            public_law: "119-120",
            updated_at: "2026-10-09T10:03:10.913Z",
          }),
        ],
      ])
    );
    mockFetchBillLifecycleSource.mockResolvedValue({
      introducedDate: "2025-01-28",
      milestones: {
        presented_date: null,
        signed_date: null,
        vetoed_date: null,
        became_law_date: null,
        law_kind: null,
        public_law: null,
        latest_action_date: "2025-01-28",
        latest_action_text: "Referred to the House Committee on Energy and Commerce.",
        unrecognized: [],
      },
    });
    mockUpsertLifecycle.mockResolvedValue(undefined);

    await refreshBillLifecycles({ DB: {} as D1Database, CONGRESS: "119", SESSION: "2" } as never, [], "test");

    expect(mockClearLifecycleEnactment).toHaveBeenCalledWith({}, { congress: 119, billType: "HR", billNumber: 766 });
  });

  it("keeps a stored law when the refresh confirms it", async () => {
    mockSelectPresentedPending.mockResolvedValue([]);
    mockSelectLawsUpdatedBefore.mockResolvedValue([{ bill_congress: 119, bill_type: "S", bill_number: 766 }]);
    mockGetLifecyclesForBills.mockResolvedValue(
      new Map([
        [
          "119:S:766",
          row({ bill_type: "S", bill_number: 766, became_law_date: "2026-10-07", public_law: "119-120", updated_at: "2026-10-10T00:00:00.000Z" }),
        ],
      ])
    );
    mockFetchBillLifecycleSource.mockResolvedValue({
      introducedDate: null,
      milestones: {
        presented_date: null,
        signed_date: "2026-10-07",
        vetoed_date: null,
        became_law_date: "2026-10-07",
        law_kind: "signed",
        public_law: "119-120",
        latest_action_date: "2026-10-07",
        latest_action_text: "Became Public Law No: 119-120.",
        unrecognized: [],
      },
    });
    mockUpsertLifecycle.mockResolvedValue(undefined);

    await refreshBillLifecycles({ DB: {} as D1Database, CONGRESS: "119", SESSION: "2" } as never, [], "test");

    expect(mockClearLifecycleEnactment).not.toHaveBeenCalled();
  });
});

describe("recheckStoredLaws", () => {
  const env = { DB: {} as D1Database, CONGRESS: "119", SESSION: "2" } as never;
  const milestones = (m: Record<string, unknown>) => ({
    presented_date: null,
    signed_date: null,
    vetoed_date: null,
    became_law_date: null,
    law_kind: null,
    public_law: null,
    latest_action_date: null,
    latest_action_text: null,
    unrecognized: [],
    ...m,
  });

  beforeEach(() => {
    resetSchemaFlag();
    vi.clearAllMocks();
    mockSelectLawsUpdatedBefore.mockResolvedValue([
      { bill_congress: 119, bill_type: "HR", bill_number: 766 },
      { bill_congress: 119, bill_type: "S", bill_number: 629 },
      { bill_congress: 119, bill_type: "S", bill_number: 2 },
    ]);
    mockGetLifecyclesForBills.mockResolvedValue(
      new Map([
        ["119:HR:766", row({ bill_number: 766, became_law_date: "2025-01-28", public_law: "119-120", updated_at: "2026-10-09T00:00:00.000Z" })],
        ["119:S:629", row({ bill_type: "S", bill_number: 629, became_law_date: "2026-07-12", law_kind: "law_unsigned", public_law: "119-102", updated_at: "2026-07-18T00:00:00.000Z" })],
        ["119:S:2", row({ bill_type: "S", bill_number: 2, became_law_date: "2026-07-01", law_kind: "signed", public_law: "119-90", updated_at: "2026-07-14T00:00:00.000Z" })],
      ])
    );
    mockFetchBillLifecycleSource.mockImplementation(async (_env: unknown, ref: { number: number }) => ({
      introducedDate: null,
      milestones:
        ref.number === 766
          ? milestones({ latest_action_text: "Referred to the House Committee on Energy and Commerce." })
          : ref.number === 629
            ? milestones({ became_law_date: "2026-07-12", signed_date: "2026-07-12", law_kind: "signed", public_law: "119-102" })
            : milestones({ became_law_date: "2026-07-01", signed_date: "2026-07-01", law_kind: "signed", public_law: "119-90" }),
    }));
    mockUpsertLifecycle.mockResolvedValue(undefined);
    mockClearLifecycleEnactment.mockResolvedValue(undefined);
    mockCountLawsUpdatedBefore.mockResolvedValue(0);
  });

  it("dry run reports every change and writes nothing", async () => {
    const result = await recheckStoredLaws(env, { limit: 40, apply: false, trigger: "test" });
    expect(result).toMatchObject({ applied: false, checked: 3, unchanged: 1, warnings: [] });
    expect(result.changes).toEqual([
      {
        bill: expect.stringContaining("766"),
        before: { became_law_date: "2025-01-28", law_kind: null, public_law: "119-120" },
        after: { became_law_date: null, law_kind: null, public_law: null },
      },
      {
        bill: expect.stringContaining("629"),
        before: { became_law_date: "2026-07-12", law_kind: "law_unsigned", public_law: "119-102" },
        after: { became_law_date: "2026-07-12", law_kind: "signed", public_law: "119-102" },
      },
    ]);
    expect(mockUpsertLifecycle).not.toHaveBeenCalled();
    expect(mockClearLifecycleEnactment).not.toHaveBeenCalled();
  });

  it("apply writes each law and clears the one Congress.gov does not show", async () => {
    const result = await recheckStoredLaws(env, { limit: 40, apply: true, trigger: "test" });
    expect(result.changes).toHaveLength(2);
    expect(mockUpsertLifecycle).toHaveBeenCalledTimes(3);
    expect(mockClearLifecycleEnactment).toHaveBeenCalledWith({}, { congress: 119, billType: "HR", billNumber: 766 });
  });

  it("keeps going past a bill Congress.gov fails on", async () => {
    mockFetchBillLifecycleSource.mockRejectedValueOnce(new Error("congress.gov 503"));
    const result = await recheckStoredLaws(env, { limit: 40, apply: true, trigger: "test" });
    expect(result.checked).toBe(2);
    expect(result.warnings).toEqual([expect.stringContaining("congress.gov 503")]);
  });
});
