import { beforeEach, describe, expect, it, vi } from "vitest";
import { DIGEST_SOURCE_TITLE_FALLBACK } from "../d1/digests";
import { parseDigestRefreshRequest, runDigestRefreshPipeline } from "./run-digest-refresh";

const mockFetchBillSummaryBundle = vi.fn();
const mockRewriteSummary = vi.fn();
const mockUpsertDigest = vi.fn();
const mockGetDigest = vi.fn();
const mockReplaceBillSponsors = vi.fn();
const mockResolveOpenRouterModel = vi.fn();

vi.mock("../sources/congress-client", () => ({
  fetchBillSummaryBundle: (...args: unknown[]) => mockFetchBillSummaryBundle(...args),
}));

vi.mock("../synthesis/openrouter", () => ({
  rewriteSummary: (...args: unknown[]) => mockRewriteSummary(...args),
}));

vi.mock("../d1/digests", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../d1/digests")>();
  return {
    ...actual,
    getDigest: (...args: unknown[]) => mockGetDigest(...args),
    upsertDigest: (...args: unknown[]) => mockUpsertDigest(...args),
  };
});

vi.mock("../d1/sponsors", () => ({
  replaceBillSponsors: (...args: unknown[]) => mockReplaceBillSponsors(...args),
}));

vi.mock("../synthesis/model", () => ({
  resolveOpenRouterModel: (...args: unknown[]) => mockResolveOpenRouterModel(...args),
}));

function createEnv(): any {
  return {
    DB: {},
    CONGRESS: "119",
    CONGRESS_API_KEY: "test-key",
    OPENROUTER_API_KEY: "test-key",
  };
}

describe("parseDigestRefreshRequest", () => {
  it("parses bill and bills query params", () => {
    const url = new URL(
      "https://worker.example.com/__pipeline/run/digest-refresh?bill=HR1234&bills=S.2,H.Res.512"
    );
    const bills = parseDigestRefreshRequest(url, createEnv());
    expect(bills).toEqual([
      { congress: 119, type: "HR", number: 1234 },
      { congress: 119, type: "S", number: 2 },
      { congress: 119, type: "HRES", number: 512 },
    ]);
  });

  it("throws when no bill identifiers are provided", () => {
    const url = new URL("https://worker.example.com/__pipeline/run/digest-refresh");
    expect(() => parseDigestRefreshRequest(url, createEnv())).toThrow(
      "Provide at least one bill"
    );
  });
});

describe("runDigestRefreshPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveOpenRouterModel.mockResolvedValue("nvidia/nemotron-3-ultra-550b-a55b:free");
    mockReplaceBillSponsors.mockResolvedValue(undefined);
    mockFetchBillSummaryBundle.mockResolvedValue({
      title: "Sample Act",
      policyArea: "Education",
      rawSummaryText: "Official CRS summary text.",
      introducedDate: "2025-01-01",
      sponsors: [],
    });
    mockRewriteSummary.mockResolvedValue({
      headline: "Sample headline",
      what_it_does: "Blocks federal aid for ghost students.",
      key_points: ["Requires campus verification"],
      terms_explained: [],
    });
    mockUpsertDigest.mockResolvedValue(undefined);
    mockGetDigest.mockResolvedValue(null);
  });

  it("stores a title fallback when the rewrite misses and no LLM digest exists", async () => {
    mockRewriteSummary.mockResolvedValue(null);
    mockFetchBillSummaryBundle.mockResolvedValue({
      title: "Equal Pay for Equal Work Act",
      policyArea: null,
      rawSummaryText: null,
      introducedDate: null,
      sponsors: [],
    });

    const result = await runDigestRefreshPipeline(createEnv(), [
      { congress: 119, type: "HR", number: 10239 },
    ]);

    expect(result).toMatchObject({
      refreshed: 0,
      skipped: 1,
      fallbacksWritten: 1,
      failures: [{ bill: "HR10239", reason: "openrouter_rewrite_failed_title_fallback_written" }],
    });
    expect(mockUpsertDigest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        number: 10239,
        digest: expect.objectContaining({ source: DIGEST_SOURCE_TITLE_FALLBACK }),
      })
    );
  });

  it("never overwrites a stored LLM digest with a fallback when the rewrite misses", async () => {
    mockRewriteSummary.mockResolvedValue(null);
    mockGetDigest.mockResolvedValue({
      congress: 119,
      bill_type: "HR",
      number: 1234,
      title: "Sample Act",
      policy_area: "Education",
      raw_summary_text: "Official CRS summary text.",
      digest_json: JSON.stringify({ headline: "Existing", what_it_does: "Already good." }),
    });

    const result = await runDigestRefreshPipeline(createEnv(), [
      { congress: 119, type: "HR", number: 1234 },
    ]);

    expect(result).toMatchObject({
      refreshed: 0,
      skipped: 1,
      fallbacksWritten: 0,
      failures: [{ bill: "HR1234", reason: "openrouter_rewrite_failed" }],
    });
    expect(mockUpsertDigest).not.toHaveBeenCalled();
  });

  it("rewrites and upserts digests even when a digest already exists", async () => {
    const result = await runDigestRefreshPipeline(createEnv(), [
      { congress: 119, type: "HR", number: 1234 },
    ]);

    expect(result).toMatchObject({
      model: "nvidia/nemotron-3-ultra-550b-a55b:free",
      requested: 1,
      refreshed: 1,
      skipped: 0,
      failures: [],
    });
    expect(mockReplaceBillSponsors).toHaveBeenCalledOnce();
    expect(mockRewriteSummary).toHaveBeenCalledOnce();
    expect(mockUpsertDigest).toHaveBeenCalledOnce();
  });

  it("rewrites from title when CRS text is missing", async () => {
    mockFetchBillSummaryBundle.mockResolvedValue({
      title: "Sample Act",
      policyArea: null,
      rawSummaryText: null,
      introducedDate: null,
      sponsors: [],
    });

    const result = await runDigestRefreshPipeline(createEnv(), [
      { congress: 119, type: "S", number: 2 },
    ]);

    expect(result.refreshed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.failures).toEqual([]);
    expect(mockRewriteSummary).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        title: "Sample Act",
        rawSummary: null,
      }),
      expect.anything()
    );
    expect(mockUpsertDigest).toHaveBeenCalledOnce();
  });

  it("records failures when both title and CRS text are missing", async () => {
    mockFetchBillSummaryBundle.mockResolvedValue({
      title: null,
      policyArea: null,
      rawSummaryText: null,
      introducedDate: null,
      sponsors: [],
    });

    const result = await runDigestRefreshPipeline(createEnv(), [
      { congress: 119, type: "S", number: 2 },
    ]);

    expect(result.refreshed).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.failures[0]).toMatchObject({ bill: "S2", reason: "no_title_or_crs" });
    expect(mockRewriteSummary).not.toHaveBeenCalled();
    expect(mockReplaceBillSponsors).toHaveBeenCalledOnce();
  });
});
