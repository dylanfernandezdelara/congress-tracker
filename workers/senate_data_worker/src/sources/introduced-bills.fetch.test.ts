import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config";

const mockFetchJsonWithMeta = vi.fn();
const mockFetchJson = vi.fn();

vi.mock("./http", () => ({
  fetchJsonWithMeta: (...args: unknown[]) => mockFetchJsonWithMeta(...args),
  fetchJson: (...args: unknown[]) => mockFetchJson(...args),
  nextPageUrl: (url: string) => url,
}));

import { fetchRecentIntroducedBills } from "./introduced-bills";

function createEnv(): Env {
  return {
    CONGRESS: "119",
    SESSION: "2",
    DB: {} as D1Database,
    CONGRESS_API_KEY: "test",
    OPENROUTER_API_KEY: "test",
  };
}

function listBill(
  type: string,
  number: number,
  extras: { introducedDate?: string | null; latestAction?: { actionDate: string; text: string } }
) {
  return {
    congress: 119,
    type,
    number,
    title: `Bill ${number}`,
    ...extras,
  };
}

describe("fetchRecentIntroducedBills", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("still detail-fetches undated intro actions after 20 dated list rows", async () => {
    const dated = Array.from({ length: 20 }, (_, i) =>
      listBill("hr", i + 1, {
        introducedDate: "2026-08-28",
        latestAction: { actionDate: "2026-08-28", text: "Introduced in House" },
      })
    );
    mockFetchJsonWithMeta
      .mockResolvedValueOnce({
        data: {
          bills: [
            ...dated,
            listBill("hr", 9901, {
              introducedDate: null,
              latestAction: { actionDate: "2026-09-03", text: "Introduced in House" },
            }),
          ],
        },
      })
      .mockResolvedValueOnce({ data: { bills: [] } });
    mockFetchJson.mockResolvedValue({
      bill: { introducedDate: "2026-09-03", title: "Ban Artificial Superintelligence Act" },
    });

    const result = await fetchRecentIntroducedBills(createEnv(), 119, {
      lookbackDate: "2026-08-28",
      maxNew: 20,
      maxPagesPerType: 1,
      detailFetches: 5,
    });

    expect(mockFetchJson).toHaveBeenCalled();
    expect(result[0]).toMatchObject({
      type: "HR",
      number: 9901,
      introducedDate: "2026-09-03",
    });
    expect(result).toHaveLength(20);
  });

  it("caps by newest introducedDate", async () => {
    mockFetchJsonWithMeta
      .mockResolvedValueOnce({
        data: {
          bills: [
            listBill("hr", 1, { introducedDate: "2026-09-01" }),
            listBill("hr", 2, { introducedDate: "2026-09-03" }),
            listBill("s", 3, { introducedDate: "2026-09-02" }),
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          bills: [listBill("s", 4, { introducedDate: "2026-08-20" })],
        },
      });

    const result = await fetchRecentIntroducedBills(createEnv(), 119, {
      lookbackDate: "2026-08-28",
      maxNew: 2,
      maxPagesPerType: 1,
    });

    expect(result.map((bill) => bill.number)).toEqual([2, 3]);
    expect(mockFetchJson).not.toHaveBeenCalled();
  });
});
