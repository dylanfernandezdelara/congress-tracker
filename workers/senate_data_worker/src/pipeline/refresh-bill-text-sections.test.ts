import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config";
import type { BillTextDocumentRow } from "../d1/bill-text-sections";

const mockGetDocuments = vi.fn();
const mockReplaceSections = vi.fn();
const mockTouch = vi.fn();
const mockUpsertProbe = vi.fn();
const mockFetchLatestVersion = vi.fn();
const mockFetchBodies = vi.fn();

vi.mock("../d1/bill-text-sections", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../d1/bill-text-sections")>();
  return {
    ...actual,
    getBillTextDocumentsForBills: (...args: unknown[]) => mockGetDocuments(...args),
    replaceBillTextSections: (...args: unknown[]) => mockReplaceSections(...args),
    touchBillTextDocumentCheckedAt: (...args: unknown[]) => mockTouch(...args),
    upsertBillTextDocumentProbe: (...args: unknown[]) => mockUpsertProbe(...args),
  };
});

vi.mock("../sources/bill-text", () => ({
  fetchLatestBillTextVersion: (...args: unknown[]) => mockFetchLatestVersion(...args),
  fetchBillSectionBodies: (...args: unknown[]) => mockFetchBodies(...args),
}));

import { refreshBillTextSections } from "./refresh-bill-text-sections";

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

const hr1 = { bill_congress: 119, bill_type: "HR", bill_number: 1 };
const s2 = { bill_congress: 119, bill_type: "S", bill_number: 2 };
const engrossed = { type: "Engrossed in House", date: "2026-07-22", xmlUrl: "https://x/eh.xml" };
const today = new Date().toISOString();

function storedDoc(overrides: Partial<BillTextDocumentRow> = {}): BillTextDocumentRow {
  return {
    congress: 119,
    bill_type: "HR",
    bill_number: 1,
    text_version: engrossed.type,
    text_version_date: engrossed.date,
    section_count: 3,
    checked_at: "2026-07-23T00:00:00.000Z",
    fetched_at: "2026-07-23T00:00:00.000Z",
    ...overrides,
  };
}

describe("refreshBillTextSections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDocuments.mockResolvedValue(new Map());
    mockReplaceSections.mockResolvedValue(undefined);
    mockTouch.mockResolvedValue(undefined);
    mockUpsertProbe.mockResolvedValue(undefined);
  });

  it("skips everything without an API key", async () => {
    const result = await refreshBillTextSections(createEnv({ CONGRESS_API_KEY: "" }), [hr1], "t");
    expect(result).toEqual({ fetched: 0, skipped: 1, remaining: 0, warnings: [] });
    expect(mockFetchLatestVersion).not.toHaveBeenCalled();
  });

  it("downloads and stores sections for a bill with no stored text", async () => {
    mockFetchLatestVersion.mockResolvedValue(engrossed);
    mockFetchBodies.mockResolvedValue([{ label: "1.", heading: "Short title", body: "Cited as…" }]);

    const result = await refreshBillTextSections(createEnv(), [hr1], "test");

    expect(result).toEqual({ fetched: 1, skipped: 0, remaining: 0, warnings: [] });
    expect(mockFetchBodies).toHaveBeenCalledWith(engrossed.xmlUrl);
    expect(mockReplaceSections).toHaveBeenCalledWith(
      expect.anything(),
      { congress: 119, billType: "HR", billNumber: 1 },
      engrossed,
      [{ label: "1.", heading: "Short title", body: "Cited as…" }]
    );
  });

  it("only touches checked_at when the stored print is still the newest", async () => {
    mockGetDocuments.mockResolvedValue(new Map([["119:HR:1", storedDoc()]]));
    mockFetchLatestVersion.mockResolvedValue(engrossed);

    const result = await refreshBillTextSections(createEnv(), [hr1], "test");

    expect(result.fetched).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockTouch).toHaveBeenCalledTimes(1);
    expect(mockFetchBodies).not.toHaveBeenCalled();
  });

  it("does not re-probe a bill already checked today", async () => {
    mockGetDocuments.mockResolvedValue(new Map([["119:HR:1", storedDoc({ checked_at: today })]]));

    const result = await refreshBillTextSections(createEnv(), [hr1], "test");

    expect(result).toEqual({ fetched: 0, skipped: 1, remaining: 0, warnings: [] });
    expect(mockFetchLatestVersion).not.toHaveBeenCalled();
  });

  it("records a probe and counts the bill as remaining when no text is published", async () => {
    mockFetchLatestVersion.mockResolvedValue(null);

    const result = await refreshBillTextSections(createEnv(), [hr1], "test");

    expect(result).toEqual({ fetched: 0, skipped: 1, remaining: 1, warnings: [] });
    expect(mockUpsertProbe).toHaveBeenCalledWith(
      expect.anything(),
      { congress: 119, billType: "HR", billNumber: 1 },
      null
    );
  });

  it("serves bills without stored text before re-checking stored ones and honours the cap", async () => {
    mockGetDocuments.mockResolvedValue(new Map([["119:HR:1", storedDoc()]]));
    mockFetchLatestVersion.mockResolvedValue(engrossed);
    mockFetchBodies.mockResolvedValue([]);

    const result = await refreshBillTextSections(createEnv(), [hr1, s2], "test", { maxFetches: 1 });

    // S.2 (no stored text) consumed the single probe; H.R.1 was cap-skipped.
    expect(mockFetchLatestVersion).toHaveBeenCalledTimes(1);
    expect(mockFetchLatestVersion.mock.calls[0]![1]).toEqual({ congress: 119, type: "S", number: 2 });
    expect(result).toEqual({ fetched: 1, skipped: 1, remaining: 0, warnings: [] });
  });

  it("turns oversize prints and thrown errors into warnings", async () => {
    mockFetchLatestVersion
      .mockResolvedValueOnce(engrossed)
      .mockRejectedValueOnce(new Error("HTTP 500"));
    mockFetchBodies.mockResolvedValue(null);

    const result = await refreshBillTextSections(createEnv(), [hr1, s2], "test");

    expect(result.fetched).toBe(0);
    expect(result.remaining).toBe(2);
    expect(result.warnings).toEqual([
      expect.stringContaining("exceeds the size cap"),
      expect.stringContaining("HTTP 500"),
    ]);
    expect(mockUpsertProbe).toHaveBeenCalledWith(
      expect.anything(),
      { congress: 119, billType: "HR", billNumber: 1 },
      engrossed
    );
  });
});
