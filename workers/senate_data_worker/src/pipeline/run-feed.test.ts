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
const mockBillHasSponsors = vi.fn();
const mockReplaceBillSponsors = vi.fn();
const mockFetchBillSummaryBundle = vi.fn();
const mockFetchBillLifecycleSource = vi.fn();
const mockRewriteSummary = vi.fn();
const mockIngestPassageVotesByChamber = vi.fn();
const mockEnsureMemberRoster = vi.fn<() => Promise<boolean>>();
const mockGetLifecyclesForBills = vi.fn();
const mockUpsertLifecycle = vi.fn();
const mockSelectPresentedPendingLifecycleBills = vi.fn();
const mockRefreshBillTextChanges = vi.fn(async (..._args: unknown[]) => ({
  refreshed: 0,
  skipped: 0,
  withAddedProvisions: 0,
  warnings: [] as string[],
}));

vi.mock("../d1/digests", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../d1/digests")>();
  return {
    ...actual,
    getDigest: (...args: Parameters<typeof mockGetDigest>) => mockGetDigest(...args),
    upsertDigest: (...args: unknown[]) => mockUpsertDigest(...args),
  };
});

vi.mock("../d1/sponsors", () => ({
  billHasSponsors: (...args: unknown[]) => mockBillHasSponsors(...args),
  replaceBillSponsors: (...args: unknown[]) => mockReplaceBillSponsors(...args),
}));

vi.mock("./persist-bill-sponsors", () => ({
  persistBillSponsors: (...args: unknown[]) => mockReplaceBillSponsors(...args),
}));

vi.mock("../d1/votes", () => ({
  selectExistingVoteKeys: (...args: unknown[]) => mockSelectExistingVoteKeys(...args),
  upsertVote: (...args: unknown[]) => mockUpsertVote(...args),
  upsertNonPassageVoteStub: vi.fn(async () => undefined),
  selectRecentVotedBills: (...args: unknown[]) => mockSelectRecentVotedBills(...args),
}));

vi.mock("../d1/lifecycle", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../d1/lifecycle")>();
  return {
    ...actual,
    getLifecyclesForBills: (...args: unknown[]) => mockGetLifecyclesForBills(...args),
    upsertLifecycle: (...args: unknown[]) => mockUpsertLifecycle(...args),
    selectPresentedPendingLifecycleBills: (...args: unknown[]) =>
      mockSelectPresentedPendingLifecycleBills(...args),
  };
});

vi.mock("../sources/congress-client", () => ({
  fetchBillSummaryBundle: (...args: unknown[]) => mockFetchBillSummaryBundle(...args),
  fetchBillLifecycleSource: (...args: unknown[]) => mockFetchBillLifecycleSource(...args),
  lookbackStartIso: (days: number) => `2026-01-01-${days}`,
}));

vi.mock("../synthesis/openrouter", () => ({
  rewriteSummary: (...args: unknown[]) => mockRewriteSummary(...args),
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

vi.mock("./refresh-bill-text-changes", () => ({
  refreshBillTextChanges: (...args: unknown[]) => mockRefreshBillTextChanges(...args),
}));

vi.mock("./refresh-confirmations", () => ({
  persistConfirmationVotes: vi.fn(async (_db: D1Database, votes: unknown[]) => votes.length),
  refreshConfirmationEnrichment: vi.fn(async () => ({
    nominationsFetched: 0,
    backgroundsRewritten: 0,
    wikipediaLookups: 0,
    skipped: 0,
    warnings: [] as string[],
  })),
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
      senate: { votes: [], skipped: 0, confirmationVotes: [] },
      chamberWarnings: [],
    });
    mockSelectRecentVotedBills.mockResolvedValue([billRow]);
    mockBillHasSponsors.mockResolvedValue(true);
    mockReplaceBillSponsors.mockResolvedValue(undefined);
    mockFetchBillSummaryBundle.mockResolvedValue({
      title: "Test Bill",
      policyArea: "Defense",
      rawSummaryText: "CRS summary text",
      introducedDate: "2025-01-01",
      sponsors: [
        {
          bioguideId: "G000555",
          state: "NY",
          fullName: "Rep. Example",
          party: "D",
          isPrimary: true,
        },
      ],
    });
    mockFetchBillLifecycleSource.mockResolvedValue({
      introducedDate: "2025-01-01",
      milestones: {
        presented_date: null,
        signed_date: null,
        vetoed_date: null,
        became_law_date: null,
        law_kind: null,
        public_law: null,
        latest_action_date: "2025-01-01",
        latest_action_text: "Introduced in House",
      },
    });
    mockGetLifecyclesForBills.mockResolvedValue(new Map());
    mockUpsertLifecycle.mockResolvedValue(undefined);
    mockSelectPresentedPendingLifecycleBills.mockResolvedValue([]);
    mockRewriteSummary.mockResolvedValue({
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

  it("skips bills with a complete digest and sponsors", async () => {
    mockGetDigest.mockResolvedValue({
      ...completeDigest,
      digest_json: JSON.stringify({
        headline: "Done",
        what_it_does: "Already complete",
        key_points: [],
        terms_explained: [],
      }),
    });
    mockBillHasSponsors.mockResolvedValue(true);

    const result = await runFeedPipeline(createEnv());

    expect(mockEnsureMemberRoster).toHaveBeenCalledOnce();
    expect(result.digestsSkipped).toBe(1);
    expect(result.digestsWritten).toBe(0);
    expect(mockFetchBillSummaryBundle).not.toHaveBeenCalled();
    expect(mockUpsertDigest).not.toHaveBeenCalled();
    expect(mockReplaceBillSponsors).not.toHaveBeenCalled();
  });

  it("backfills sponsors when a complete digest is missing them", async () => {
    mockGetDigest.mockResolvedValue({
      ...completeDigest,
      digest_json: JSON.stringify({
        headline: "Done",
        what_it_does: "Already complete",
        key_points: [],
        terms_explained: [],
      }),
    });
    mockBillHasSponsors.mockResolvedValue(false);

    const result = await runFeedPipeline(createEnv());

    expect(result.digestsSkipped).toBe(1);
    expect(result.digestsWritten).toBe(0);
    expect(mockFetchBillSummaryBundle).toHaveBeenCalledOnce();
    expect(mockReplaceBillSponsors).toHaveBeenCalledWith(
      expect.anything(),
      { congress: 119, type: "HR", number: 1 },
      [
        {
          bioguideId: "G000555",
          state: "NY",
          fullName: "Rep. Example",
          party: "D",
          isPrimary: true,
        },
      ]
    );
    expect(mockUpsertDigest).not.toHaveBeenCalled();
  });

  it("retries tombstone rows with null digest_json", async () => {
    mockGetDigest.mockResolvedValue(tombstoneDigest);

    const result = await runFeedPipeline(createEnv());

    expect(result.digestsSkipped).toBe(0);
    expect(result.digestsWritten).toBe(1);
    expect(mockFetchBillSummaryBundle).toHaveBeenCalledOnce();
    expect(mockRewriteSummary).toHaveBeenCalledOnce();
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
    expect(mockRewriteSummary).toHaveBeenCalledTimes(20);
  });

  it("refreshes lifecycle for feed bills and skips terminal rows", async () => {
    mockGetDigest.mockResolvedValue(completeDigest);
    mockGetLifecyclesForBills.mockResolvedValue(
      new Map([
        [
          "119:HR:1",
          {
            congress: 119,
            bill_type: "HR",
            bill_number: 1,
            introduced_date: "2025-01-01",
            presented_date: "2026-01-01",
            signed_date: "2026-01-10",
            vetoed_date: null,
            became_law_date: "2026-01-10",
            law_kind: "signed",
            public_law: "119-1",
            latest_action_date: "2026-01-10",
            latest_action_text: "Became Public Law No: 119-1.",
            updated_at: "2026-01-10T00:00:00.000Z",
          },
        ],
      ])
    );

    const result = await runFeedPipeline(createEnv());

    expect(result.lifecycleSkipped).toBe(1);
    expect(result.lifecycleRefreshed).toBe(0);
    expect(mockFetchBillLifecycleSource).not.toHaveBeenCalled();
    expect(mockUpsertLifecycle).not.toHaveBeenCalled();
  });

  it("upserts lifecycle when non-terminal and continues on fetch errors", async () => {
    mockGetDigest.mockResolvedValue(completeDigest);
    mockFetchBillLifecycleSource.mockRejectedValue(new Error("congress.gov down"));

    const result = await runFeedPipeline(createEnv());

    expect(result.lifecycleRefreshed).toBe(0);
    expect(result.lifecycleWarnings).toHaveLength(1);
    expect(result.lifecycleWarnings[0]).toContain("congress.gov down");
  });

});
