import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config";
import { DIGEST_SOURCE_TITLE_FALLBACK, type DigestRow } from "../d1/digests";

const mockGetDigest = vi.fn();
const mockUpsertDigest = vi.fn();
const mockBillHasSponsors = vi.fn();
const mockReplaceBillSponsors = vi.fn();
const mockFetchBillSummaryBundle = vi.fn();
const mockRewriteSummary = vi.fn();
const mockIngestPassageVotesForBill = vi.fn();

vi.mock("../d1/digests", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../d1/digests")>();
  return {
    ...actual,
    getDigest: (...args: unknown[]) => mockGetDigest(...args),
    upsertDigest: (...args: unknown[]) => mockUpsertDigest(...args),
  };
});

vi.mock("../d1/sponsors", () => ({
  billHasSponsors: (...args: unknown[]) => mockBillHasSponsors(...args),
  replaceBillSponsors: (...args: unknown[]) => mockReplaceBillSponsors(...args),
}));

vi.mock("../sources/congress-client", () => ({
  fetchBillSummaryBundle: (...args: unknown[]) => mockFetchBillSummaryBundle(...args),
}));

vi.mock("../synthesis/openrouter", () => ({
  rewriteSummary: (...args: unknown[]) => mockRewriteSummary(...args),
}));

vi.mock("./ingest-bill-passage-votes", () => ({
  ingestPassageVotesForBill: (...args: unknown[]) => mockIngestPassageVotesForBill(...args),
}));

import { hydrateBillFromCongress } from "./hydrate-bill";

const bill = { congress: 119, type: "HR", number: 5555 };

const titleOnly: DigestRow = {
  congress: 119,
  bill_type: "HR",
  number: 5555,
  title: "To designate a post office",
  policy_area: "Government Operations and Politics",
  raw_summary_text: null,
  digest_json: JSON.stringify({
    headline: "Names a Springfield post office",
    what_it_does: "This bill names a post office in Springfield.",
  }),
};

function createEnv(): Env {
  return {
    CONGRESS: "119",
    SESSION: "2",
    DB: {} as D1Database,
    CONGRESS_API_KEY: "test",
    OPENROUTER_API_KEY: "test",
  };
}

describe("hydrateBillFromCongress CRS upgrade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBillHasSponsors.mockResolvedValue(true);
    mockReplaceBillSponsors.mockResolvedValue(undefined);
    mockIngestPassageVotesForBill.mockResolvedValue(0);
    mockRewriteSummary.mockResolvedValue({
      headline: "CRS rewrite",
      what_it_does: "Uses the official summary.",
      key_points: [],
      terms_explained: [],
    });
    mockUpsertDigest.mockResolvedValue(undefined);
  });

  it("rewrites a title-only digest when CRS text later appears", async () => {
    mockGetDigest.mockResolvedValue(titleOnly);
    mockFetchBillSummaryBundle.mockResolvedValue({
      title: "To designate a post office",
      policyArea: "Government Operations and Politics",
      rawSummaryText: "This bill designates the Springfield facility as the Example Post Office.",
      introducedDate: "2026-09-01",
      sponsors: [],
    });

    await expect(hydrateBillFromCongress(createEnv(), bill)).resolves.toBe(true);

    expect(mockRewriteSummary).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        rawSummary: "This bill designates the Springfield facility as the Example Post Office.",
      })
    );
    expect(mockUpsertDigest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        rawSummaryText: "This bill designates the Springfield facility as the Example Post Office.",
        digest: expect.objectContaining({ headline: "CRS rewrite" }),
      })
    );
  });

  it("writes a title fallback instead of a null digest when the rewrite misses", async () => {
    mockGetDigest.mockResolvedValue(null);
    mockRewriteSummary.mockResolvedValue(null);
    mockFetchBillSummaryBundle.mockResolvedValue({
      title: "Equal Pay for Equal Work Act",
      policyArea: null,
      rawSummaryText: null,
      introducedDate: "2026-09-03",
      sponsors: [],
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(hydrateBillFromCongress(createEnv(), bill)).resolves.toBe(true);

    expect(mockUpsertDigest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        digest: expect.objectContaining({
          headline: "Equal Pay for Equal Work Act",
          source: DIGEST_SOURCE_TITLE_FALLBACK,
        }),
      })
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('"event":"executive_bill_digest_title_fallback"')
    );
    warn.mockRestore();
  });

  it("retries the LLM for a stored title fallback even without CRS", async () => {
    mockGetDigest.mockResolvedValue({
      ...titleOnly,
      digest_json: JSON.stringify({
        headline: "To designate a post office",
        what_it_does: 'This measure is titled "To designate a post office" and does not yet have an official summary.',
        key_points: [],
        terms_explained: [],
        source: DIGEST_SOURCE_TITLE_FALLBACK,
      }),
    });
    mockFetchBillSummaryBundle.mockResolvedValue({
      title: "To designate a post office",
      policyArea: "Government Operations and Politics",
      rawSummaryText: null,
      introducedDate: "2026-09-01",
      sponsors: [],
    });

    await expect(hydrateBillFromCongress(createEnv(), bill)).resolves.toBe(true);

    expect(mockRewriteSummary).toHaveBeenCalledOnce();
    expect(mockUpsertDigest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ digest: expect.objectContaining({ headline: "CRS rewrite" }) })
    );
  });

  it("keeps a stored title fallback when the retry misses", async () => {
    mockGetDigest.mockResolvedValue({
      ...titleOnly,
      digest_json: JSON.stringify({
        headline: "To designate a post office",
        what_it_does: "Restated title.",
        key_points: [],
        terms_explained: [],
        source: DIGEST_SOURCE_TITLE_FALLBACK,
      }),
    });
    mockRewriteSummary.mockResolvedValue(null);
    mockFetchBillSummaryBundle.mockResolvedValue({
      title: "To designate a post office",
      policyArea: "Government Operations and Politics",
      rawSummaryText: null,
      introducedDate: "2026-09-01",
      sponsors: [],
    });

    await expect(hydrateBillFromCongress(createEnv(), bill)).resolves.toBe(true);

    expect(mockUpsertDigest).not.toHaveBeenCalled();
    expect(mockIngestPassageVotesForBill).toHaveBeenCalledOnce();
  });

  it("rebuilds the stored fallback when CRS arrives but the retry misses", async () => {
    mockGetDigest.mockResolvedValue({
      ...titleOnly,
      digest_json: JSON.stringify({
        headline: "To designate a post office",
        what_it_does: "Restated title.",
        key_points: [],
        terms_explained: [],
        source: DIGEST_SOURCE_TITLE_FALLBACK,
      }),
    });
    mockRewriteSummary.mockResolvedValue(null);
    mockFetchBillSummaryBundle.mockResolvedValue({
      title: "To designate a post office",
      policyArea: "Government Operations and Politics",
      rawSummaryText: "This bill designates the Springfield facility as the Example Post Office.",
      introducedDate: "2026-09-01",
      sponsors: [],
    });

    await expect(hydrateBillFromCongress(createEnv(), bill)).resolves.toBe(true);

    expect(mockUpsertDigest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        rawSummaryText: "This bill designates the Springfield facility as the Example Post Office.",
        digest: expect.objectContaining({
          what_it_does: "This bill designates the Springfield facility as the Example Post Office.",
          source: DIGEST_SOURCE_TITLE_FALLBACK,
        }),
      })
    );
  });

  it("does not overwrite a title-only digest when CRS is still missing", async () => {
    mockGetDigest.mockResolvedValue(titleOnly);
    mockFetchBillSummaryBundle.mockResolvedValue({
      title: "To designate a post office",
      policyArea: "Government Operations and Politics",
      rawSummaryText: null,
      introducedDate: "2026-09-01",
      sponsors: [],
    });

    await expect(hydrateBillFromCongress(createEnv(), bill)).resolves.toBe(true);
    expect(mockRewriteSummary).not.toHaveBeenCalled();
    expect(mockUpsertDigest).not.toHaveBeenCalled();
  });
});
