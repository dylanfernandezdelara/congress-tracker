import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseDigestRefreshRequest, runDigestRefreshPipeline } from "./run-digest-refresh";

const mockFetchBillSummaryBundle = vi.fn();
const mockRewriteSummary = vi.fn();
const mockUpsertDigest = vi.fn();
const mockResolveOpenRouterModel = vi.fn();

vi.mock("../sources/congress-client", () => ({
  fetchBillSummaryBundle: (...args: unknown[]) => mockFetchBillSummaryBundle(...args),
}));

vi.mock("../synthesis/openrouter", () => ({
  rewriteSummary: (...args: unknown[]) => mockRewriteSummary(...args),
}));

vi.mock("../d1/digests", () => ({
  upsertDigest: (...args: unknown[]) => mockUpsertDigest(...args),
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
    mockFetchBillSummaryBundle.mockResolvedValue({
      title: "Sample Act",
      policyArea: "Education",
      rawSummaryText: "Official CRS summary text.",
    });
    mockRewriteSummary.mockResolvedValue({
      headline: "Sample headline",
      what_it_does: "Blocks federal aid for ghost students.",
      key_points: ["Requires campus verification"],
      terms_explained: [],
    });
    mockUpsertDigest.mockResolvedValue(undefined);
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
    expect(mockRewriteSummary).toHaveBeenCalledOnce();
    expect(mockUpsertDigest).toHaveBeenCalledOnce();
  });

  it("records and persists failures when CRS text is missing", async () => {
    mockFetchBillSummaryBundle.mockResolvedValue({
      title: "Providing for consideration of H.R. 8800",
      policyArea: null,
      rawSummaryText: null,
    });

    const result = await runDigestRefreshPipeline(createEnv(), [
      { congress: 119, type: "HRES", number: 1398 },
    ]);

    expect(result.refreshed).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.failures[0]).toMatchObject({ bill: "HRES1398", reason: "no_crs_summary" });
    expect(mockRewriteSummary).not.toHaveBeenCalled();
    expect(mockUpsertDigest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ digestFailureReason: "no_crs_summary", digest: null })
    );
  });
});
