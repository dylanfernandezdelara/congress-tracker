import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config";
import type { BillTextChangesRow } from "../d1/bill-text-changes";

const mockGetBillTextChangesForBills = vi.fn();
const mockUpsertBillTextChanges = vi.fn();
const mockFetchSource = vi.fn();
const mockCompareBillText = vi.fn();

vi.mock("../d1/bill-text-changes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../d1/bill-text-changes")>();
  return {
    ...actual,
    getBillTextChangesForBills: (...args: unknown[]) => mockGetBillTextChangesForBills(...args),
    upsertBillTextChanges: (...args: unknown[]) => mockUpsertBillTextChanges(...args),
  };
});

vi.mock("../sources/bill-text", () => ({
  fetchBillTextChangesSource: (...args: unknown[]) => mockFetchSource(...args),
  compareBillText: (...args: unknown[]) => mockCompareBillText(...args),
}));

import {
  isStoredComparisonCurrent,
  refreshBillTextChanges,
  wasCheckedOn,
} from "./refresh-bill-text-changes";

function createEnv(overrides: Partial<Env> = {}): Env {
  return {
    CONGRESS: "119",
    SESSION: "2",
    DB: {} as D1Database,
    CONGRESS_API_KEY: "test",
    OPENROUTER_API_KEY: "test",
    ...overrides,
  } as Env;
}

const hr7008 = { bill_congress: 119, bill_type: "HR", bill_number: 7008 };

const reportedVersion = {
  type: "Reported in House",
  date: "2026-02-03",
  xmlUrl: "https://example.test/rh.xml",
};
const engrossedVersion = {
  type: "Engrossed in House",
  date: "2026-07-22",
  xmlUrl: "https://example.test/eh.xml",
};

function storedRow(overrides: Partial<BillTextChangesRow> = {}): BillTextChangesRow {
  return {
    congress: 119,
    bill_type: "HR",
    bill_number: 7008,
    summary_version: "Reported in House",
    summary_version_date: "2026-02-03",
    latest_version: "Engrossed in House",
    latest_version_date: "2026-07-22",
    added_json: "[]",
    more_added_count: 0,
    checked_at: "2026-07-23T00:00:00.000Z",
    ...overrides,
  };
}

describe("wasCheckedOn", () => {
  it("matches a row already probed today and nothing else", () => {
    expect(wasCheckedOn(storedRow({ checked_at: "2026-07-23T09:00:00.000Z" }), "2026-07-23")).toBe(
      true
    );
    expect(wasCheckedOn(storedRow({ checked_at: "2026-07-22T23:59:00.000Z" }), "2026-07-23")).toBe(
      false
    );
    expect(wasCheckedOn(undefined, "2026-07-23")).toBe(false);
  });
});

describe("isStoredComparisonCurrent", () => {
  const source = {
    summaryDate: "2026-02-03",
    summaryVersion: reportedVersion,
    latestVersion: engrossedVersion,
  };

  it("is current when both version stamps match", () => {
    expect(isStoredComparisonCurrent(storedRow(), source)).toBe(true);
  });

  it("is stale when a newer text version appears", () => {
    expect(
      isStoredComparisonCurrent(
        storedRow({ latest_version: "Reported in House", latest_version_date: "2026-02-03" }),
        source
      )
    ).toBe(false);
  });

  it("is stale when the summary moves to a different version", () => {
    expect(
      isStoredComparisonCurrent(storedRow({ summary_version_date: "2026-01-12" }), source)
    ).toBe(false);
  });

  it("is not current without a stored row", () => {
    expect(isStoredComparisonCurrent(undefined, source)).toBe(false);
  });
});

describe("refreshBillTextChanges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBillTextChangesForBills.mockResolvedValue(new Map());
    mockUpsertBillTextChanges.mockResolvedValue(undefined);
    mockFetchSource.mockResolvedValue({
      summaryDate: "2026-02-03",
      summaryVersion: reportedVersion,
      latestVersion: engrossedVersion,
    });
    mockCompareBillText.mockResolvedValue(null);
  });

  it("stores added provisions when the newest text adds sections", async () => {
    mockCompareBillText.mockResolvedValue({
      summary_version: "Reported in House",
      summary_version_date: "2026-02-03",
      latest_version: "Engrossed in House",
      latest_version_date: "2026-07-22",
      added_provisions: [{ label: "3.", heading: "Requiring voters to provide photo identification" }],
      more_added_count: 1,
    });

    const result = await refreshBillTextChanges(createEnv(), [hr7008], "manual");

    expect(result).toMatchObject({ refreshed: 1, withAddedProvisions: 1, warnings: [] });
    expect(mockUpsertBillTextChanges).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        congress: 119,
        billType: "HR",
        billNumber: 7008,
        latestVersion: "Engrossed in House",
        moreAddedCount: 1,
        addedProvisions: [
          { label: "3.", heading: "Requiring voters to provide photo identification" },
        ],
      })
    );
  });

  it("records an empty comparison so an unchanged bill is not re-diffed", async () => {
    const result = await refreshBillTextChanges(createEnv(), [hr7008], "manual");

    expect(result).toMatchObject({ refreshed: 1, withAddedProvisions: 0 });
    expect(mockUpsertBillTextChanges).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ addedProvisions: [], moreAddedCount: 0 })
    );
  });

  it("skips the text download when stored versions still match", async () => {
    mockGetBillTextChangesForBills.mockResolvedValue(
      new Map([["119:HR:7008", storedRow({ added_json: '[{"label":"3.","heading":"Photo ID"}]' })]])
    );

    const result = await refreshBillTextChanges(createEnv(), [hr7008], "scheduled");

    expect(mockCompareBillText).not.toHaveBeenCalled();
    expect(mockUpsertBillTextChanges).not.toHaveBeenCalled();
    expect(result).toMatchObject({ refreshed: 0, skipped: 1, withAddedProvisions: 1 });
  });

  it("does not re-probe versions for a bill already checked today", async () => {
    // Without this, every manual re-run costs two Congress.gov requests per feed bill.
    mockGetBillTextChangesForBills.mockResolvedValue(
      new Map([
        [
          "119:HR:7008",
          storedRow({
            checked_at: new Date().toISOString(),
            added_json: '[{"label":"3.","heading":"Photo ID"}]',
          }),
        ],
      ])
    );

    const result = await refreshBillTextChanges(createEnv(), [hr7008], "manual");

    expect(mockFetchSource).not.toHaveBeenCalled();
    expect(result).toMatchObject({ refreshed: 0, skipped: 1, withAddedProvisions: 1 });
  });

  it("collects per-bill failures as warnings instead of failing the run", async () => {
    mockFetchSource.mockRejectedValue(new Error("HTTP 503"));

    const result = await refreshBillTextChanges(createEnv(), [hr7008], "scheduled");

    expect(result.refreshed).toBe(0);
    expect(result.warnings).toEqual(["H.R. 7008 · 119th Congress: HTTP 503"]);
  });

  it("does nothing without a Congress.gov API key", async () => {
    const result = await refreshBillTextChanges(
      createEnv({ CONGRESS_API_KEY: "" }),
      [hr7008],
      "scheduled"
    );

    expect(mockFetchSource).not.toHaveBeenCalled();
    expect(result).toMatchObject({ refreshed: 0, skipped: 1 });
  });
});
