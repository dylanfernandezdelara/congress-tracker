import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseDigestRefreshRequest, runDigestRefreshPipeline } from "./run-digest-refresh";

const mockPrepareBill = vi.fn();
const mockWriteSummary = vi.fn();
const mockSettleJob = vi.fn();
const mockReplaceBillSponsors = vi.fn();

vi.mock("../digest/prepare", () => ({ prepareBill: (...args: unknown[]) => mockPrepareBill(...args) }));
vi.mock("../digest/write", () => ({ writeSummary: (...args: unknown[]) => mockWriteSummary(...args) }));
vi.mock("../d1/digest-jobs", () => ({ settleJob: (...args: unknown[]) => mockSettleJob(...args) }));
vi.mock("../d1/sponsors", () => ({
  replaceBillSponsors: (...args: unknown[]) => mockReplaceBillSponsors(...args),
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
  const sponsors = [{ bioguideId: "G000555", state: "NY", fullName: "Rep. Example", party: "D", isPrimary: true }];

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrepareBill.mockImplementation(async (_env, ref) => ({ ref, bundle: { sponsors } }));
  });

  it("rewrites named bills through the shared writer and marks their queue jobs done", async () => {
    mockWriteSummary.mockResolvedValue({ status: "stored", model: "anthropic/claude-sonnet-5", cost: 0.012, warnings: [] });
    const bill = { congress: 119, type: "HR", number: 1 };

    const result = await runDigestRefreshPipeline(createEnv(), [bill]);

    expect(mockWriteSummary).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ ref: bill }), "rewrite");
    expect(mockReplaceBillSponsors).toHaveBeenCalledWith({}, bill, sponsors);
    expect(mockSettleJob).toHaveBeenCalledWith({}, bill, "done");
    expect(result).toEqual({
      requested: 1,
      refreshed: 1,
      skipped: 0,
      models: ["anthropic/claude-sonnet-5"],
      costUsd: 0.012,
      failures: [],
    });
  });

  it("reports rejected summaries, budget stops and upstream errors per bill", async () => {
    mockWriteSummary
      .mockResolvedValueOnce({ status: "rejected", model: "m", cost: 0.01, reasons: ["number not in sources: 45"] })
      .mockResolvedValueOnce({ status: "over_budget", cost: 0 });
    mockPrepareBill.mockImplementationOnce(async (_env, ref) => ({ ref, bundle: { sponsors } }))
      .mockImplementationOnce(async (_env, ref) => ({ ref, bundle: { sponsors } }))
      .mockRejectedValueOnce(new Error("HTTP 503"));

    const result = await runDigestRefreshPipeline(createEnv(), [
      { congress: 119, type: "HR", number: 1 },
      { congress: 119, type: "HR", number: 2 },
      { congress: 119, type: "HR", number: 3 },
    ]);

    expect(result.refreshed).toBe(0);
    expect(result.failures).toEqual([
      { bill: "HR1", reason: "rejected: number not in sources: 45" },
      { bill: "HR2", reason: "daily budget spent" },
      { bill: "HR3", reason: "upstream_error: HTTP 503" },
    ]);
    expect(mockSettleJob).not.toHaveBeenCalled();
  });
});
