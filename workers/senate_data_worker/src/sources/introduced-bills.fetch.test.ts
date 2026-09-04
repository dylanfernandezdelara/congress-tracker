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
  extras: {
    title?: string;
    introducedDate?: string | null;
    latestAction?: { actionDate: string; text: string };
    policyArea?: { name: string };
    sponsors?: Array<{ bioguideId: string }>;
  } = {}
) {
  return {
    congress: 119,
    type,
    number,
    title: extras.title ?? `Bill ${number}`,
    ...extras,
  };
}

describe("fetchRecentIntroducedBills", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchJson.mockReset();
    mockFetchJsonWithMeta.mockReset();
  });

  it("keeps Ban Artificial Superintelligence Act with Sanders (S000033) in the persist set", async () => {
    const generics = Array.from({ length: 12 }, (_, i) =>
      listBill("hr", i + 1, {
        title: "A bill to amend title 5, United States Code",
        introducedDate: "2026-09-01",
      })
    );
    mockFetchJsonWithMeta
      .mockResolvedValueOnce({
        data: {
          bills: [
            ...generics,
            listBill("s", 9901, {
              title: "Ban Artificial Superintelligence Act",
              introducedDate: "2026-09-03",
              sponsors: [{ bioguideId: "S000033" }],
            }),
            listBill("hr", 50, {
              title: "For the relief of Jane Doe",
              introducedDate: "2026-09-03",
            }),
            listBill("s", 52, {
              title: "A bill for the relief of Jane Doe",
              introducedDate: "2026-09-03",
            }),
            listBill("hr", 51, {
              title:
                "To designate the facility of the United States Postal Service located at 100 Main Street as the Jane Doe Post Office Building",
              introducedDate: "2026-09-03",
            }),
          ],
        },
      })
      .mockResolvedValueOnce({ data: { bills: [] } });

    const result = await fetchRecentIntroducedBills(createEnv(), 119, {
      lookbackDate: "2026-08-28",
      maxPagesPerType: 1,
    });

    const asi = result.find((bill) => bill.number === 9901);
    expect(asi).toMatchObject({
      type: "S",
      number: 9901,
      title: "Ban Artificial Superintelligence Act",
      primarySponsorBioguide: "S000033",
    });
    expect(result[0]).toMatchObject({ number: 9901 });
    expect(result.some((bill) => /relief of/i.test(bill.title ?? ""))).toBe(false);
    expect(result.some((bill) => /postal service/i.test(bill.title ?? ""))).toBe(false);
    expect(result).toHaveLength(12);
  });

  it("still detail-fetches undated intro actions after a full dated list", async () => {
    const dated = Array.from({ length: 15 }, (_, i) =>
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
            listBill("s", 9901, {
              title: "Ban Artificial Superintelligence Act",
              introducedDate: null,
              latestAction: { actionDate: "2026-09-03", text: "Introduced in Senate" },
            }),
          ],
        },
      })
      .mockResolvedValueOnce({ data: { bills: [] } });
    mockFetchJson.mockResolvedValue({
      bill: {
        introducedDate: "2026-09-03",
        title: "Ban Artificial Superintelligence Act",
        sponsors: [{ bioguideId: "S000033" }],
      },
    });

    const result = await fetchRecentIntroducedBills(createEnv(), 119, {
      lookbackDate: "2026-08-28",
      maxPagesPerType: 1,
      detailFetches: 5,
    });

    expect(mockFetchJson).toHaveBeenCalled();
    expect(result[0]).toMatchObject({
      type: "S",
      number: 9901,
      introducedDate: "2026-09-03",
      primarySponsorBioguide: "S000033",
    });
    expect(result).toHaveLength(12);
  });

  it("caps after hard-filter + soft-rank, not by date alone", async () => {
    mockFetchJsonWithMeta
      .mockResolvedValueOnce({
        data: {
          bills: [
            listBill("hr", 1, { title: "A bill to amend title 5", introducedDate: "2026-09-01" }),
            listBill("hr", 2, {
              title: "Ban Artificial Superintelligence Act",
              introducedDate: "2026-09-03",
              sponsors: [{ bioguideId: "S000033" }],
            }),
            listBill("s", 3, { title: "A bill to amend title 5", introducedDate: "2026-09-02" }),
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
  });

  it("keeps a missing-policy/sponsor survivor when it is not hard junk", async () => {
    mockFetchJsonWithMeta
      .mockResolvedValueOnce({
        data: {
          bills: [
            listBill("s", 88, {
              title: "Housing Reform Act",
              introducedDate: "2026-09-02",
            }),
          ],
        },
      })
      .mockResolvedValueOnce({ data: { bills: [] } });

    const result = await fetchRecentIntroducedBills(createEnv(), 119, {
      lookbackDate: "2026-08-28",
      maxPagesPerType: 1,
    });

    expect(result).toEqual([
      expect.objectContaining({
        number: 88,
        title: "Housing Reform Act",
        policyArea: null,
        primarySponsorBioguide: null,
      }),
    ]);
  });

  it("keeps dated list intros when a detail fetch throws", async () => {
    mockFetchJsonWithMeta
      .mockResolvedValueOnce({
        data: {
          bills: [
            listBill("hr", 1, { introducedDate: "2026-09-01" }),
            listBill("hr", 9901, {
              introducedDate: null,
              latestAction: { actionDate: "2026-09-03", text: "Introduced in House" },
            }),
          ],
        },
      })
      .mockResolvedValueOnce({ data: { bills: [] } });
    mockFetchJson.mockRejectedValue(new Error("HTTP 500"));

    const result = await fetchRecentIntroducedBills(createEnv(), 119, {
      lookbackDate: "2026-08-28",
      maxPagesPerType: 1,
      detailFetches: 5,
    });

    expect(result).toEqual([
      expect.objectContaining({ type: "HR", number: 1, introducedDate: "2026-09-01" }),
    ]);
  });

  it("drops Private Legislation after the same bill-detail fetch", async () => {
    mockFetchJsonWithMeta
      .mockResolvedValueOnce({
        data: {
          bills: [
            listBill("hr", 9, {
              title: "A bill relating to an individual",
              introducedDate: null,
              latestAction: { actionDate: "2026-09-03", text: "Introduced in House" },
            }),
          ],
        },
      })
      .mockResolvedValueOnce({ data: { bills: [] } });
    mockFetchJson.mockResolvedValue({
      bill: {
        introducedDate: "2026-09-03",
        title: "A bill relating to an individual",
        policyArea: { name: "Private Legislation" },
      },
    });

    const result = await fetchRecentIntroducedBills(createEnv(), 119, {
      lookbackDate: "2026-08-28",
      maxPagesPerType: 1,
      detailFetches: 5,
    });

    expect(result).toEqual([]);
  });
});
