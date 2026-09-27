import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config";
import { DIGEST_SOURCE_TITLE_FALLBACK, digestMapKey, type DigestGenerator, type DigestRow } from "../d1/digests";
import type { LifecycleBillRow } from "../d1/lifecycle";
import type { BillSummaryBundle } from "../sources/congress-client";

const mockGetDigest = vi.fn();
const mockGetDigestsForBills = vi.fn();
const mockUpsertDigest = vi.fn();
const mockBillHasSponsors = vi.fn();
const mockReplaceBillSponsors = vi.fn();
const mockFetchBillSummaryBundle = vi.fn();
const mockEnqueue = vi.fn();

vi.mock("../d1/digests", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../d1/digests")>();
  return {
    ...actual,
    getDigest: (...args: unknown[]) => mockGetDigest(...args),
    getDigestsForBills: (...args: unknown[]) => mockGetDigestsForBills(...args),
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

import { refreshFeedDigests } from "./refresh-feed-digests";

const env = { CONGRESS: "119", SESSION: "2", DB: {} as D1Database, CONGRESS_API_KEY: "k", OPENROUTER_API_KEY: "k" } as Env;

const bill = (number: number): LifecycleBillRow => ({ bill_congress: 119, bill_type: "HR", bill_number: number });

const bundle: BillSummaryBundle = {
  title: "Equal Pay for Equal Work Act",
  policyArea: null,
  rawSummaryText: null,
  introducedDate: "2026-09-03",
  sponsors: [{ bioguideId: "G000555", state: "NY", fullName: "Rep. Example", party: "D", isPrimary: true }],
};

function row(number: number, digest: Record<string, unknown> | null): DigestRow {
  return {
    congress: 119,
    bill_type: "HR",
    number,
    title: bundle.title,
    policy_area: null,
    raw_summary_text: null,
    digest_json: digest ? JSON.stringify(digest) : null,
  };
}

const content = { headline: "Bill would require equal pay audits", what_it_does: "Requires audits.", key_points: ["a"], terms_explained: [] };
const generator = (overrides: Partial<DigestGenerator> = {}): DigestGenerator => ({
  model: "openai/gpt-6-luna",
  prompt_version: "v3",
  tier: "new",
  text_version: "Introduced in House",
  fingerprint: "abc",
  long: false,
  generated_at: "2026-09-26T00:00:00Z",
  ...overrides,
});

function withDigests(rows: DigestRow[]): void {
  mockGetDigestsForBills.mockResolvedValue(new Map(rows.map((r) => [digestMapKey(r.congress, r.bill_type, r.number), r])));
}

const queued = (tier: "new" | "rewrite") =>
  (mockEnqueue.mock.calls.find((c) => c[2] === tier)?.[1] ?? []) as Array<{ number: number }>;

describe("refreshFeedDigests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withDigests([]);
    mockBillHasSponsors.mockResolvedValue(true);
    mockFetchBillSummaryBundle.mockResolvedValue(bundle);
  });

  it("gives a bill with no summary its title fallback now and queues it", async () => {
    const result = await refreshFeedDigests(env, [bill(1)]);

    expect(result).toEqual({ written: 1, skipped: 0, queued: 1, warnings: [] });
    expect(mockReplaceBillSponsors).toHaveBeenCalledWith(env.DB, { congress: 119, type: "HR", number: 1 }, bundle.sponsors);
    expect(mockUpsertDigest.mock.calls[0]![1].digest).toMatchObject({ source: DIGEST_SOURCE_TITLE_FALLBACK });
    expect(queued("new").map((b) => b.number)).toEqual([1]);
  });

  it("queues feed-window bills as rewrites and the rest as first summaries", async () => {
    await refreshFeedDigests(env, [bill(1), bill(2)], { prioritize: [bill(2)] });

    expect(queued("new").map((b) => b.number)).toEqual([1]);
    expect(queued("rewrite").map((b) => b.number)).toEqual([2]);
  });

  it("queues a summary from before the current writer without refetching or overwriting it", async () => {
    withDigests([row(1, content)]);

    const result = await refreshFeedDigests(env, [bill(1)]);

    expect(result.queued).toBe(1);
    expect(mockFetchBillSummaryBundle).not.toHaveBeenCalled();
    expect(mockUpsertDigest).not.toHaveBeenCalled();
  });

  it("skips a current first summary outside the feed window", async () => {
    withDigests([row(1, { ...content, generator: generator() })]);

    const result = await refreshFeedDigests(env, [bill(1)]);

    expect(result).toEqual({ written: 0, skipped: 1, queued: 0, warnings: [] });
  });

  it("queues a first summary for a rewrite once the bill is in the feed window", async () => {
    withDigests([row(1, { ...content, generator: generator() })]);

    await refreshFeedDigests(env, [bill(1)], { prioritize: [bill(1)] });

    expect(queued("rewrite").map((b) => b.number)).toEqual([1]);
  });

  it("skips feed-window bills already rewritten, and long bills (Luna at every tier)", async () => {
    withDigests([
      row(1, { ...content, generator: generator({ tier: "rewrite", model: "anthropic/claude-sonnet-5" }) }),
      row(2, { ...content, generator: generator({ long: true }) }),
    ]);

    const result = await refreshFeedDigests(env, [bill(1), bill(2)], { prioritize: [bill(1), bill(2)] });

    expect(result.skipped).toBe(2);
    expect(result.queued).toBe(0);
  });

  it("backfills sponsors for a summarized bill that has none", async () => {
    withDigests([row(1, { ...content, generator: generator() })]);
    mockBillHasSponsors.mockResolvedValue(false);

    await refreshFeedDigests(env, [bill(1)]);

    expect(mockReplaceBillSponsors).toHaveBeenCalledOnce();
    expect(mockUpsertDigest).not.toHaveBeenCalled();
  });

  it("reads rows one by one when the bulk lookup fails", async () => {
    mockGetDigestsForBills.mockRejectedValue(new Error("D1 timeout"));
    mockGetDigest.mockResolvedValue(row(1, { ...content, generator: generator() }));

    const result = await refreshFeedDigests(env, [bill(1)]);

    expect(result.warnings).toEqual(["bulk digest lookup failed: D1 timeout"]);
    expect(result.skipped).toBe(1);
  });

  it("reports a Congress.gov failure and continues with the next bill", async () => {
    mockFetchBillSummaryBundle.mockRejectedValueOnce(new Error("HTTP 503"));

    const result = await refreshFeedDigests(env, [bill(1), bill(2)]);

    expect(result.warnings).toEqual(["H.R. 1 · 119th Congress: HTTP 503"]);
    expect(result.written).toBe(1);
    expect(queued("new").map((b) => b.number)).toEqual([2]);
  });
});
