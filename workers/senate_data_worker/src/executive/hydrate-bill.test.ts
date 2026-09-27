import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config";
import { DIGEST_SOURCE_TITLE_FALLBACK, type DigestRow } from "../d1/digests";
import type { BillSummaryBundle } from "../sources/congress-client";

const mockGetDigest = vi.fn();
const mockUpsertDigest = vi.fn();
const mockBillHasSponsors = vi.fn();
const mockReplaceBillSponsors = vi.fn();
const mockFetchBillSummaryBundle = vi.fn();
const mockEnqueue = vi.fn();
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

vi.mock("../d1/digest-jobs", () => ({
  enqueueDigestJobs: (...args: unknown[]) => mockEnqueue(...args),
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

const bundle: BillSummaryBundle = {
  title: "To designate a post office",
  policyArea: "Government Operations and Politics",
  rawSummaryText: null,
  introducedDate: "2026-09-01",
  sponsors: [],
};

const generated = (tier: "new" | "rewrite"): DigestRow => ({
  ...titleOnly,
  digest_json: JSON.stringify({
    headline: "Names a Springfield post office",
    what_it_does: "Names a post office.",
    generator: { model: "m", prompt_version: "v3", tier, text_version: null, fingerprint: "f", long: false, generated_at: "t" },
  }),
});

describe("hydrateBillFromCongress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBillHasSponsors.mockResolvedValue(true);
    mockIngestPassageVotesForBill.mockResolvedValue(0);
    mockFetchBillSummaryBundle.mockResolvedValue(bundle);
  });

  it("writes a title fallback for a bill with no summary and queues a rewrite", async () => {
    mockGetDigest.mockResolvedValue(null);

    await expect(hydrateBillFromCongress(createEnv(), bill)).resolves.toBe(true);

    expect(mockUpsertDigest.mock.calls[0]![1].digest).toMatchObject({ source: DIGEST_SOURCE_TITLE_FALLBACK });
    expect(mockEnqueue).toHaveBeenCalledWith(expect.anything(), [bill], "rewrite");
    expect(mockIngestPassageVotesForBill).toHaveBeenCalledOnce();
  });

  it("queues an older summary for a rewrite without overwriting it", async () => {
    mockGetDigest.mockResolvedValue(titleOnly);

    await hydrateBillFromCongress(createEnv(), bill);

    expect(mockUpsertDigest).not.toHaveBeenCalled();
    expect(mockFetchBillSummaryBundle).not.toHaveBeenCalled();
    expect(mockEnqueue).toHaveBeenCalledWith(expect.anything(), [bill], "rewrite");
  });

  it("leaves a rewritten bill alone", async () => {
    mockGetDigest.mockResolvedValue(generated("rewrite"));

    await hydrateBillFromCongress(createEnv(), bill);

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("fetches sponsors when a summarized bill has none", async () => {
    mockGetDigest.mockResolvedValue(generated("new"));
    mockBillHasSponsors.mockResolvedValue(false);

    await hydrateBillFromCongress(createEnv(), bill);

    expect(mockReplaceBillSponsors).toHaveBeenCalledOnce();
    expect(mockUpsertDigest).not.toHaveBeenCalled();
    expect(mockEnqueue).toHaveBeenCalledWith(expect.anything(), [bill], "rewrite");
  });

  it("returns false when Congress.gov has no title for an unknown bill", async () => {
    mockGetDigest.mockResolvedValue(null);
    mockFetchBillSummaryBundle.mockResolvedValue({ ...bundle, title: null });

    await expect(hydrateBillFromCongress(createEnv(), bill)).resolves.toBe(false);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});
