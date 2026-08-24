import { beforeEach, describe, expect, it, vi } from "vitest";
import { persistPublicLaws, publicLawsToBillRows } from "./refresh-public-laws";
import type { PublicLawRecord } from "../sources/public-laws";
import { resetSchemaFlag } from "../d1/schema";

const mockGetLifecyclesForBills = vi.fn();
const mockUpsertLifecycle = vi.fn();
const mockGetDigest = vi.fn();
const mockUpsertDigest = vi.fn();

vi.mock("../d1/lifecycle", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../d1/lifecycle")>();
  return {
    ...actual,
    getLifecyclesForBills: (...args: unknown[]) => mockGetLifecyclesForBills(...args),
    upsertLifecycle: (...args: unknown[]) => mockUpsertLifecycle(...args),
  };
});

vi.mock("../d1/digests", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../d1/digests")>();
  return {
    ...actual,
    getDigest: (...args: unknown[]) => mockGetDigest(...args),
    upsertDigest: (...args: unknown[]) => mockUpsertDigest(...args),
  };
});

function law(partial: Partial<PublicLawRecord> = {}): PublicLawRecord {
  return {
    congress: 119,
    billType: "S",
    billNumber: 1003,
    title: "Lulu’s Law",
    becameLawDate: "2026-06-26",
    publicLaw: "119-100",
    latestActionText: "Became Public Law No: 119-100.",
    milestones: {
      presented_date: null,
      signed_date: null,
      vetoed_date: null,
      became_law_date: "2026-06-26",
      law_kind: null,
      public_law: "119-100",
      latest_action_date: "2026-06-26",
      latest_action_text: "Became Public Law No: 119-100.",
    },
    ...partial,
  };
}

describe("publicLawsToBillRows", () => {
  it("maps list rows onto lifecycle refresh candidates", () => {
    expect(publicLawsToBillRows([law()])).toEqual([
      { bill_congress: 119, bill_type: "S", bill_number: 1003 },
    ]);
  });
});

describe("persistPublicLaws", () => {
  beforeEach(() => {
    resetSchemaFlag();
    mockGetLifecyclesForBills.mockReset();
    mockUpsertLifecycle.mockReset();
    mockGetDigest.mockReset();
    mockUpsertDigest.mockReset();
    mockUpsertLifecycle.mockResolvedValue(undefined);
    mockUpsertDigest.mockResolvedValue(undefined);
  });

  it("upserts missing enacted rows and writes a title when no digest exists", async () => {
    mockGetLifecyclesForBills.mockResolvedValue(new Map());
    mockGetDigest.mockResolvedValue(null);

    const result = await persistPublicLaws(
      { DB: {} as D1Database, CONGRESS: "119" } as never,
      [law()],
      "test"
    );

    expect(result).toMatchObject({ listed: 1, upserted: 1, titlesWritten: 1 });
    expect(mockUpsertLifecycle).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        congress: 119,
        billType: "S",
        billNumber: 1003,
        becameLawDate: "2026-06-26",
        publicLaw: "119-100",
      })
    );
    expect(mockUpsertDigest).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        title: "Lulu’s Law",
        number: 1003,
        preserveDigestJson: null,
      })
    );
  });

  it("does not overwrite an already-enacted lifecycle row", async () => {
    mockGetLifecyclesForBills.mockResolvedValue(
      new Map([
        [
          "119:S:1003",
          {
            congress: 119,
            bill_type: "S",
            bill_number: 1003,
            introduced_date: null,
            presented_date: "2026-06-20",
            signed_date: "2026-06-26",
            vetoed_date: null,
            became_law_date: "2026-06-26",
            law_kind: "signed",
            public_law: "119-100",
            latest_action_date: "2026-06-26",
            latest_action_text: "Signed by President.",
            updated_at: "2026-06-26T00:00:00.000Z",
          },
        ],
      ])
    );
    mockGetDigest.mockResolvedValue({
      congress: 119,
      bill_type: "S",
      number: 1003,
      title: "Lulu’s Law",
      policy_area: "Science, Technology, Communications",
      raw_summary_text: "summary",
      digest_json: JSON.stringify({
        headline: "New Alerts for Shark Attacks on Phones",
        what_it_does: "Adds shark-attack alerts.",
        key_points: [],
        terms_explained: [],
      }),
    });

    const result = await persistPublicLaws(
      { DB: {} as D1Database, CONGRESS: "119" } as never,
      [law()],
      "test"
    );

    expect(result.upserted).toBe(0);
    expect(result.titlesWritten).toBe(0);
    expect(mockUpsertLifecycle).not.toHaveBeenCalled();
    expect(mockUpsertDigest).not.toHaveBeenCalled();
  });

  it("repairs leftover local-sample digest titles on already-enacted bills", async () => {
    mockGetLifecyclesForBills.mockResolvedValue(
      new Map([
        [
          "119:HR:6644",
          {
            congress: 119,
            bill_type: "HR",
            bill_number: 6644,
            introduced_date: null,
            presented_date: "2026-06-29",
            signed_date: null,
            vetoed_date: null,
            became_law_date: "2026-07-11",
            law_kind: "law_unsigned",
            public_law: "119-101",
            latest_action_date: "2026-07-11",
            latest_action_text: "Became Public Law No: 119-101.",
            updated_at: "2026-07-11T00:00:00.000Z",
          },
        ],
      ])
    );
    mockGetDigest.mockResolvedValue({
      congress: 119,
      bill_type: "HR",
      number: 6644,
      title: "21st Century ROAD to Housing Act (local sample)",
      policy_area: "Housing",
      raw_summary_text: "Sample CRS-style summary seeded for local development.",
      digest_json: JSON.stringify({
        headline: "Overhauls federal housing programs (local sample)",
        what_it_does: "Reforms federal housing finance.",
        key_points: [],
        terms_explained: [],
      }),
    });

    const result = await persistPublicLaws(
      { DB: {} as D1Database, CONGRESS: "119" } as never,
      [
        law({
          billType: "HR",
          billNumber: 6644,
          title: "21st Century ROAD to Housing Act",
          becameLawDate: "2026-07-11",
          publicLaw: "119-101",
        }),
      ],
      "test"
    );

    expect(result.upserted).toBe(0);
    expect(result.titlesWritten).toBe(1);
    expect(mockUpsertDigest).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        title: "21st Century ROAD to Housing Act",
        preserveDigestJson: expect.stringContaining("Overhauls federal housing programs"),
      })
    );
    const digestArg = mockUpsertDigest.mock.calls[0]?.[1] as { preserveDigestJson?: string };
    expect(digestArg.preserveDigestJson).not.toContain("local sample");
  });
});
