import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config";
import type { ProcessCommitteeEvent } from "../process/types";
import { HttpResponseError } from "../sources/http";

const mockFetchSource = vi.fn();
const mockParse = vi.fn();
const mockPersist = vi.fn();
const mockMarkHydrated = vi.fn();

vi.mock("../sources/congress-client", () => ({
  fetchBillCommitteesSource: (...args: unknown[]) => mockFetchSource(...args),
}));

vi.mock("../process/parse-committee-source", () => ({
  parseCommitteeEvents: (...args: unknown[]) => mockParse(...args),
}));

vi.mock("../d1/bill-process", () => ({
  persistBillProcess: (...args: unknown[]) => mockPersist(...args),
  markProcessHydrated: (...args: unknown[]) => mockMarkHydrated(...args),
  selectProcessQueueBatch: vi.fn(),
}));

import { hydrateProcessBills } from "./refresh-bill-process";

function createEnv(): Env {
  return {
    CONGRESS: "119",
    SESSION: "2",
    DB: {} as D1Database,
    CONGRESS_API_KEY: "test",
    OPENROUTER_API_KEY: "test",
  } as Env;
}

const bill = { congress: 119, billType: "HR", billNumber: 7008 };

const sampleEvent: ProcessCommitteeEvent = {
  congress: 119,
  billType: "HR",
  billNumber: 7008,
  systemCode: "hsif00",
  activityKey: "sent",
  activityAt: "2026-03-01T00:00:00.000Z",
  chamber: "House",
  committeeName: "Energy and Commerce",
  parentSystemCode: null,
  activityRaw: "Referred to the Committee on Energy and Commerce",
  tallyText: null,
};

describe("hydrateProcessBills", () => {
  beforeEach(() => {
    mockFetchSource.mockReset();
    mockParse.mockReset();
    mockPersist.mockReset();
    mockMarkHydrated.mockReset();
    mockPersist.mockResolvedValue(undefined);
    mockMarkHydrated.mockResolvedValue(undefined);
  });

  it("persists and parks the queue when parse yields events", async () => {
    mockFetchSource.mockResolvedValue({
      committees: [{ systemCode: "hsif00" }],
      actions: [{ text: "Referred" }],
      rateLimitRemaining: 500,
    });
    mockParse.mockReturnValue([sampleEvent]);

    const result = await hydrateProcessBills(createEnv(), [bill]);

    expect(mockPersist).toHaveBeenCalledTimes(1);
    expect(mockMarkHydrated).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ refreshed: 1, skipped: 0, warnings: [] });
  });

  it("parks an empty Congress.gov payload without counting a refresh", async () => {
    mockFetchSource.mockResolvedValue({
      committees: [],
      actions: [],
      rateLimitRemaining: 500,
    });
    mockParse.mockReturnValue([]);

    const result = await hydrateProcessBills(createEnv(), [bill]);

    expect(mockPersist).not.toHaveBeenCalled();
    expect(mockMarkHydrated).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ refreshed: 0, skipped: 1, warnings: [] });
  });

  it("parks bills with no committees even when actions exist", async () => {
    mockFetchSource.mockResolvedValue({
      committees: [],
      actions: [{ text: "Received in the Senate." }],
      rateLimitRemaining: 500,
    });
    mockParse.mockReturnValue([]);

    const result = await hydrateProcessBills(createEnv(), [bill]);

    expect(mockPersist).not.toHaveBeenCalled();
    expect(mockMarkHydrated).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ refreshed: 0, skipped: 1, warnings: [] });
  });

  it("parks bills whose committees payload parses to no usable events", async () => {
    mockFetchSource.mockResolvedValue({
      committees: [{ systemCode: "hsif00" }],
      actions: [{ text: "Unrelated floor action" }],
      rateLimitRemaining: 500,
    });
    mockParse.mockReturnValue([]);

    const result = await hydrateProcessBills(createEnv(), [bill]);

    expect(mockPersist).not.toHaveBeenCalled();
    expect(mockMarkHydrated).toHaveBeenCalledTimes(1);
    expect(result.refreshed).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.warnings[0]).toMatch(/parked until rehydrate/);
  });

  it("parks a terminal 404 so missing bills are not retried every run", async () => {
    mockFetchSource.mockRejectedValue(
      new HttpResponseError(404, "https://api.congress.gov/bill", null)
    );

    const result = await hydrateProcessBills(createEnv(), [bill]);

    expect(mockPersist).not.toHaveBeenCalled();
    expect(mockMarkHydrated).toHaveBeenCalledTimes(1);
    expect(result.skipped).toBe(1);
  });
});
