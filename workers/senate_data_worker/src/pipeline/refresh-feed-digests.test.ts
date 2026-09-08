import { beforeEach, describe, expect, it, vi } from "vitest";
import { DIGEST_SOURCE_TITLE_FALLBACK } from "../../../../shared/digest-api-types";
import type { Env } from "../config";
import { DIGEST_MAX_NEW_REWRITES } from "../constants";
import { digestMapKey, parseStoredDigest, type DigestRow } from "../d1/digests";
import type { LifecycleBillRow } from "../d1/lifecycle";
import type { BillSummaryBundle } from "../sources/congress-client";

const mockGetDigestsForBills = vi.fn();
const mockUpsertDigest = vi.fn();
const mockBillHasSponsors = vi.fn();
const mockReplaceBillSponsors = vi.fn();
const mockFetchBillSummaryBundle = vi.fn();
const mockRewriteSummary = vi.fn();

vi.mock("../d1/digests", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../d1/digests")>();
  return {
    ...actual,
    getDigest: vi.fn(async () => null),
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

vi.mock("../synthesis/openrouter", () => ({
  rewriteSummary: (...args: unknown[]) => mockRewriteSummary(...args),
}));

import { refreshFeedDigests } from "./refresh-feed-digests";

const MODEL = "test/model";

function createEnv(): Env {
  return {
    CONGRESS: "119",
    SESSION: "2",
    DB: {} as D1Database,
    CONGRESS_API_KEY: "test",
    OPENROUTER_API_KEY: "test",
  };
}

function bill(number: number, type = "HR"): LifecycleBillRow {
  return { bill_congress: 119, bill_type: type, bill_number: number };
}

/** Mirrors prod H.R. 10239: intro with a title, no CRS text, no policy area. */
const hr10239Bundle: BillSummaryBundle = {
  title: "Equal Pay for Equal Work Act",
  policyArea: null,
  rawSummaryText: null,
  introducedDate: "2026-09-03",
  sponsors: [],
};

const llmDigest = {
  headline: "Rewritten headline",
  what_it_does: "Does things.",
  key_points: ["one"],
  terms_explained: [],
};

function digestRows(rows: DigestRow[]): Map<string, DigestRow> {
  return new Map(rows.map((row) => [digestMapKey(row.congress, row.bill_type, row.number), row]));
}

function storedFallbackRow(overrides: Partial<DigestRow> = {}): DigestRow {
  return {
    congress: 119,
    bill_type: "HR",
    number: 10239,
    title: hr10239Bundle.title,
    policy_area: null,
    raw_summary_text: null,
    digest_json: JSON.stringify({
      headline: "Equal Pay for Equal Work Act",
      what_it_does:
        'This measure is titled "Equal Pay for Equal Work Act" and does not yet have an official summary.',
      key_points: [],
      terms_explained: [],
      source: DIGEST_SOURCE_TITLE_FALLBACK,
    }),
    ...overrides,
  };
}

function upsertedDigest(call = 0): unknown {
  return (mockUpsertDigest.mock.calls[call]?.[1] as { digest: unknown } | undefined)?.digest;
}

describe("refreshFeedDigests incomplete bills", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDigestsForBills.mockResolvedValue(new Map());
    mockUpsertDigest.mockResolvedValue(undefined);
    mockBillHasSponsors.mockResolvedValue(true);
    mockReplaceBillSponsors.mockResolvedValue(undefined);
    mockFetchBillSummaryBundle.mockResolvedValue(hr10239Bundle);
    mockRewriteSummary.mockResolvedValue(llmDigest);
  });

  it("stores the LLM digest when OpenRouter succeeds (primary path)", async () => {
    const result = await refreshFeedDigests(createEnv(), [bill(10239)], MODEL);

    expect(result).toEqual({ written: 1, skipped: 0, rewritten: 1, warnings: [] });
    expect(upsertedDigest()).toEqual(llmDigest);
  });

  it("writes a parseable title fallback and warns when OpenRouter returns null for a title-only bill", async () => {
    mockRewriteSummary.mockResolvedValue(null);

    const result = await refreshFeedDigests(createEnv(), [bill(10239)], MODEL);

    expect(result.written).toBe(1);
    expect(result.rewritten).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.warnings).toEqual([
      "H.R. 10239 · 119th Congress: OpenRouter rewrite returned no digest; wrote deterministic title fallback digest",
    ]);
    expect(mockRewriteSummary).toHaveBeenCalledOnce();
    expect(mockUpsertDigest).toHaveBeenCalledOnce();
    expect(mockUpsertDigest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        congress: 119,
        billType: "HR",
        number: 10239,
        title: "Equal Pay for Equal Work Act",
        rawSummaryText: null,
        digest: expect.objectContaining({
          headline: "Equal Pay for Equal Work Act",
          source: DIGEST_SOURCE_TITLE_FALLBACK,
        }),
      })
    );
    const stored = parseStoredDigest(JSON.stringify(upsertedDigest()));
    expect(stored?.what_it_does).toBe(
      'This measure is titled "Equal Pay for Equal Work Act" and does not yet have an official summary.'
    );
  });

  it("never re-tombstones an existing title-only row when the rewrite misses again", async () => {
    mockGetDigestsForBills.mockResolvedValue(
      digestRows([storedFallbackRow({ digest_json: null })])
    );
    mockRewriteSummary.mockResolvedValue(null);

    const result = await refreshFeedDigests(createEnv(), [bill(10239)], MODEL);

    expect(result.written).toBe(1);
    expect(upsertedDigest()).toEqual(
      expect.objectContaining({ source: DIGEST_SOURCE_TITLE_FALLBACK })
    );
    expect(result.warnings).toHaveLength(1);
  });

  it("uses the CRS opening sentence for the fallback when CRS exists but the rewrite misses", async () => {
    mockFetchBillSummaryBundle.mockResolvedValue({
      ...hr10239Bundle,
      policyArea: "Labor and Employment",
      rawSummaryText: "This bill prohibits pay discrimination. It also adds reporting.",
    });
    mockRewriteSummary.mockResolvedValue(null);

    const result = await refreshFeedDigests(createEnv(), [bill(10239)], MODEL);

    expect(result.written).toBe(1);
    expect(upsertedDigest()).toEqual({
      headline: "Equal Pay for Equal Work Act",
      what_it_does: "This bill prohibits pay discrimination.",
      key_points: ["Policy area: Labor and Employment"],
      terms_explained: [],
      source: DIGEST_SOURCE_TITLE_FALLBACK,
    });
    expect(mockUpsertDigest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        rawSummaryText: "This bill prohibits pay discrimination. It also adds reporting.",
      })
    );
  });

  it("warns and skips the LLM when Congress.gov returns neither title nor CRS", async () => {
    mockFetchBillSummaryBundle.mockResolvedValue({
      ...hr10239Bundle,
      title: null,
      rawSummaryText: null,
    });

    const result = await refreshFeedDigests(createEnv(), [bill(10239)], MODEL);

    expect(mockRewriteSummary).not.toHaveBeenCalled();
    expect(result.written).toBe(1);
    expect(mockUpsertDigest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ digest: null, title: null })
    );
    expect(result.warnings).toEqual([
      "H.R. 10239 · 119th Congress: no title or CRS summary from Congress.gov; digest left empty",
    ]);
  });

  it("does not rewrite an unchanged empty row without a rewrite source", async () => {
    mockGetDigestsForBills.mockResolvedValue(
      digestRows([storedFallbackRow({ title: null, digest_json: null })])
    );
    mockFetchBillSummaryBundle.mockResolvedValue({ ...hr10239Bundle, title: null });

    const result = await refreshFeedDigests(createEnv(), [bill(10239)], MODEL);

    expect(result.skipped).toBe(1);
    expect(mockUpsertDigest).not.toHaveBeenCalled();
    expect(result.warnings).toHaveLength(1);
  });

  it("writes title fallbacks once the rewrite budget is spent and summarizes them in one warning", async () => {
    const bills = Array.from({ length: DIGEST_MAX_NEW_REWRITES + 3 }, (_, i) => bill(i + 1));
    mockFetchBillSummaryBundle.mockImplementation(
      async (_env: Env, ref: { type: string; number: number }) => ({
        ...hr10239Bundle,
        title: `${ref.type} ${ref.number} Act`,
      })
    );

    const result = await refreshFeedDigests(createEnv(), bills, MODEL);

    expect(mockRewriteSummary).toHaveBeenCalledTimes(DIGEST_MAX_NEW_REWRITES);
    expect(result.rewritten).toBe(DIGEST_MAX_NEW_REWRITES);
    expect(result.written).toBe(DIGEST_MAX_NEW_REWRITES + 3);
    expect(result.skipped).toBe(0);
    const fallbacks = mockUpsertDigest.mock.calls.filter(
      (call) => (call[1] as { digest: { source?: string } }).digest?.source === DIGEST_SOURCE_TITLE_FALLBACK
    );
    expect(fallbacks).toHaveLength(3);
    expect(result.warnings).toEqual([
      `rewrite budget (${DIGEST_MAX_NEW_REWRITES}) spent: wrote deterministic title fallback digest for 3 bill(s); LLM retries next run`,
    ]);
  });
});

describe("refreshFeedDigests stored title fallbacks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDigestsForBills.mockResolvedValue(digestRows([storedFallbackRow()]));
    mockUpsertDigest.mockResolvedValue(undefined);
    mockBillHasSponsors.mockResolvedValue(true);
    mockReplaceBillSponsors.mockResolvedValue(undefined);
    mockFetchBillSummaryBundle.mockResolvedValue(hr10239Bundle);
    mockRewriteSummary.mockResolvedValue(llmDigest);
  });

  it("retries the LLM next run and replaces the fallback on success", async () => {
    const result = await refreshFeedDigests(createEnv(), [bill(10239)], MODEL);

    expect(mockRewriteSummary).toHaveBeenCalledOnce();
    expect(result).toEqual({ written: 1, skipped: 0, rewritten: 1, warnings: [] });
    expect(upsertedDigest()).toEqual(llmDigest);
  });

  it("keeps the stored fallback and warns when the retry misses with unchanged metadata", async () => {
    mockRewriteSummary.mockResolvedValue(null);

    const result = await refreshFeedDigests(createEnv(), [bill(10239)], MODEL);

    expect(mockUpsertDigest).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
    expect(result.warnings).toEqual([
      "H.R. 10239 · 119th Congress: OpenRouter rewrite still returned no digest; keeping stored title fallback digest",
    ]);
  });

  it("rebuilds the fallback when CRS arrives but the retry still misses", async () => {
    mockRewriteSummary.mockResolvedValue(null);
    mockFetchBillSummaryBundle.mockResolvedValue({
      ...hr10239Bundle,
      rawSummaryText: "This bill bans wage discrimination based on sex.",
    });

    const result = await refreshFeedDigests(createEnv(), [bill(10239)], MODEL);

    expect(result.written).toBe(1);
    expect(upsertedDigest()).toEqual(
      expect.objectContaining({
        what_it_does: "This bill bans wage discrimination based on sex.",
        source: DIGEST_SOURCE_TITLE_FALLBACK,
      })
    );
    expect(result.warnings).toEqual([
      "H.R. 10239 · 119th Congress: OpenRouter rewrite still returned no digest; wrote deterministic title fallback digest",
    ]);
  });

  it("does not spend budget on fallback retries before missing digests", async () => {
    const missing = Array.from({ length: DIGEST_MAX_NEW_REWRITES }, (_, i) => bill(i + 1));
    mockFetchBillSummaryBundle.mockImplementation(
      async (_env: Env, ref: { type: string; number: number }) => ({
        ...hr10239Bundle,
        title: `${ref.type} ${ref.number} Act`,
      })
    );

    const result = await refreshFeedDigests(createEnv(), [bill(10239), ...missing], MODEL);

    expect(mockRewriteSummary).toHaveBeenCalledTimes(DIGEST_MAX_NEW_REWRITES);
    const rewrittenLabels = mockRewriteSummary.mock.calls.map(
      (call) => (call[1] as { billLabel: string }).billLabel
    );
    expect(rewrittenLabels.some((label) => label.includes("10239"))).toBe(false);
    expect(result.skipped).toBe(1);
    expect(result.warnings).toEqual([]);
  });

  it("retries fallbacks before CRS upgrades of LLM title-only digests", async () => {
    mockGetDigestsForBills.mockResolvedValue(
      digestRows([
        {
          congress: 119,
          bill_type: "S",
          number: 7,
          title: "S 7 Act",
          policy_area: null,
          raw_summary_text: null,
          digest_json: JSON.stringify({ headline: "LLM title-only", what_it_does: "Works." }),
        },
        storedFallbackRow(),
      ])
    );
    mockFetchBillSummaryBundle.mockImplementation(
      async (_env: Env, ref: { type: string; number: number }) => ({
        ...hr10239Bundle,
        title: `${ref.type} ${ref.number} Act`,
        rawSummaryText: ref.type === "S" ? "CRS arrived for S. 7." : null,
      })
    );

    await refreshFeedDigests(createEnv(), [bill(7, "S"), bill(10239)], MODEL);

    const rewrittenLabels = mockRewriteSummary.mock.calls.map(
      (call) => (call[1] as { billLabel: string }).billLabel
    );
    expect(rewrittenLabels[0]).toContain("10239");
    expect(rewrittenLabels[1]).toContain("S. 7");
  });
});

describe("refreshFeedDigests CRS upgrades", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDigestsForBills.mockResolvedValue(
      digestRows([
        {
          congress: 119,
          bill_type: "HR",
          number: 10239,
          title: hr10239Bundle.title,
          policy_area: null,
          raw_summary_text: null,
          digest_json: JSON.stringify({ headline: "LLM title-only", what_it_does: "Works." }),
        },
      ])
    );
    mockUpsertDigest.mockResolvedValue(undefined);
    mockBillHasSponsors.mockResolvedValue(true);
    mockReplaceBillSponsors.mockResolvedValue(undefined);
    mockFetchBillSummaryBundle.mockResolvedValue({
      ...hr10239Bundle,
      rawSummaryText: "This bill bans wage discrimination based on sex.",
    });
  });

  it("keeps the LLM title-only digest and warns when the CRS rewrite misses", async () => {
    mockRewriteSummary.mockResolvedValue(null);

    const result = await refreshFeedDigests(createEnv(), [bill(10239)], MODEL);

    expect(mockUpsertDigest).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
    expect(result.warnings).toEqual([
      "H.R. 10239 · 119th Congress: OpenRouter CRS rewrite returned no digest; keeping title-only digest",
    ]);
  });
});
