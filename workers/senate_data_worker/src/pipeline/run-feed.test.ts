import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config";
import type { DigestRow } from "../d1/digests";

const mockGetDigest = vi.fn<
  (db: D1Database, congress: number, billType: string, number: number) => Promise<DigestRow | null>
>();
const mockUpsertDigest = vi.fn();
const mockSelectRecentVotedBills = vi.fn();
const mockSelectExistingVoteKeys = vi.fn();
const mockUpsertVote = vi.fn();
const mockFetchBillSummaryBundle = vi.fn();
const mockRewriteBillDigest = vi.fn();
const mockIngestPassageVotesByChamber = vi.fn();
const mockEnsureMemberRoster = vi.fn<() => Promise<boolean>>();

vi.mock("../d1/digests", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../d1/digests")>();
  return {
    ...actual,
    getDigest: (...args: Parameters<typeof mockGetDigest>) => mockGetDigest(...args),
    upsertDigest: (...args: unknown[]) => mockUpsertDigest(...args),
  };
});

vi.mock("../d1/votes", () => ({
  selectExistingVoteKeys: (...args: unknown[]) => mockSelectExistingVoteKeys(...args),
  upsertVote: (...args: unknown[]) => mockUpsertVote(...args),
  selectRecentVotedBills: (...args: unknown[]) => mockSelectRecentVotedBills(...args),
}));

vi.mock("../sources/congress-client", () => ({
  fetchBillSummaryBundle: (...args: unknown[]) => mockFetchBillSummaryBundle(...args),
  lookbackStartIso: (days: number) => `2026-01-01-${days}`,
}));

vi.mock("../synthesis/openrouter", () => ({
  rewriteBillDigest: (...args: unknown[]) => mockRewriteBillDigest(...args),
}));

vi.mock("../synthesis/model", () => ({
  resolveOpenRouterModel: vi.fn(async () => "nvidia/nemotron-3-ultra-550b-a55b:free"),
}));

vi.mock("./ingest-chambers", () => ({
  ingestPassageVotesByChamber: (...args: unknown[]) => mockIngestPassageVotesByChamber(...args),
}));

vi.mock("./ensure-member-roster", () => ({
  ensureMemberRoster: () => mockEnsureMemberRoster(),
}));

import { runFeedPipeline } from "./run-feed";

function createEnv(): Env {
  return {
    CONGRESS: "119",
    SESSION: "2",
    DB: {} as D1Database,
    CONGRESS_API_KEY: "test",
    OPENROUTER_API_KEY: "test",
  };
}

const billRow = {
  bill_congress: 119,
  bill_type: "HR",
  bill_number: 1,
  latest_passage_date: "2026-06-01",
};

const completeDigest: DigestRow = {
  congress: 119,
  bill_type: "HR",
  number: 1,
  title: "Complete Bill",
  policy_area: "Defense",
  raw_summary_text: "Raw summary",
  digest_json: JSON.stringify({ headline: "Done", what_it_does: "Complete summary" }),
};

const tombstoneDigest: DigestRow = {
  ...completeDigest,
  raw_summary_text: null,
  digest_json: null,
};

describe("runFeedPipeline digest retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureMemberRoster.mockResolvedValue(false);
    mockSelectExistingVoteKeys.mockResolvedValue(new Set());
    mockIngestPassageVotesByChamber.mockResolvedValue({
      house: { votes: [], skipped: 0 },
      senate: { votes: [], skipped: 0 },
      chamberWarnings: [],
    });
    mockSelectRecentVotedBills.mockResolvedValue([billRow]);
    mockFetchBillSummaryBundle.mockResolvedValue({
      title: "Test Bill",
      policyArea: "Defense",
      rawSummaryText: "CRS summary text",
    });
    mockRewriteBillDigest.mockResolvedValue({
      headline: "Rewritten headline",
      what_it_does: "Does things",
      key_points: ["one"],
      terms_explained: [],
    });
    mockUpsertDigest.mockResolvedValue(undefined);
  });

  it("retries rows with invalid digest_json that fails parseStoredDigest", async () => {
    mockGetDigest.mockResolvedValue({
      ...completeDigest,
      digest_json: JSON.stringify({ headline: "Done" }),
    });

    const result = await runFeedPipeline(createEnv());

    expect(result.digestsSkipped).toBe(0);
    expect(result.digestsWritten).toBe(1);
    expect(mockFetchBillSummaryBundle).toHaveBeenCalledOnce();
  });

  it("skips bills with a complete digest", async () => {
    mockGetDigest.mockResolvedValue({
      ...completeDigest,
      digest_json: JSON.stringify({
        headline: "Done",
        what_it_does: "Already complete",
        key_points: [],
        terms_explained: [],
      }),
    });

    const result = await runFeedPipeline(createEnv());

    expect(mockEnsureMemberRoster).toHaveBeenCalledOnce();
    expect(result.digestsSkipped).toBe(1);
    expect(result.digestsWritten).toBe(0);
    expect(mockFetchBillSummaryBundle).not.toHaveBeenCalled();
    expect(mockUpsertDigest).not.toHaveBeenCalled();
  });

  it("retries tombstone rows with null digest_json", async () => {
    mockGetDigest.mockResolvedValue(tombstoneDigest);

    const result = await runFeedPipeline(createEnv());

    expect(result.digestsSkipped).toBe(0);
    expect(result.digestsWritten).toBe(1);
    expect(mockFetchBillSummaryBundle).toHaveBeenCalledOnce();
    expect(mockRewriteBillDigest).toHaveBeenCalledOnce();
    expect(mockUpsertDigest).toHaveBeenCalledOnce();
  });

  it("writes digests for bills with no existing row", async () => {
    mockGetDigest.mockResolvedValue(null);

    const result = await runFeedPipeline(createEnv());

    expect(result.digestsSkipped).toBe(0);
    expect(result.digestsWritten).toBe(1);
    expect(mockFetchBillSummaryBundle).toHaveBeenCalledOnce();
    expect(mockUpsertDigest).toHaveBeenCalledOnce();
  });

  it("continues when member roster sync fails", async () => {
    mockGetDigest.mockResolvedValue(null);
    mockEnsureMemberRoster.mockRejectedValue(new Error("roster unavailable"));

    const result = await runFeedPipeline(createEnv());

    expect(result.digestsWritten).toBe(1);
    expect(mockUpsertDigest).toHaveBeenCalledOnce();
  });

  it("respects DIGEST_MAX_NEW_REWRITES for LLM rewrites while still storing metadata", async () => {
    const bills = Array.from({ length: 25 }, (_, i) => ({
      bill_congress: 119,
      bill_type: "HR",
      bill_number: i + 1,
      latest_passage_date: "2026-06-01",
    }));
    mockSelectRecentVotedBills.mockResolvedValue(bills);
    mockGetDigest.mockResolvedValue(tombstoneDigest);

    const result = await runFeedPipeline(createEnv());

    expect(result.digestsRewritten).toBe(20);
    expect(result.digestsWritten).toBe(25);
    expect(mockUpsertDigest).toHaveBeenCalledTimes(25);
    expect(mockRewriteBillDigest).toHaveBeenCalledTimes(20);
  });
});
