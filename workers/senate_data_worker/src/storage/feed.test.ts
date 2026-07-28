import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config";
import type { LifecycleRow } from "../d1/lifecycle";

const mockEnsureSchema = vi.fn();
const mockCountFeedBills = vi.fn();
const mockSelectFeedBills = vi.fn();
const mockGetDigestsForBills = vi.fn();
const mockGetPassageVotesForBills = vi.fn();
const mockGetExecutivePostBillsForBills = vi.fn();
const mockGetExecutivePostBillsForPosts = vi.fn();
const mockGetLifecyclesForBills = vi.fn();
const mockGetCompanionVotesForBills = vi.fn();
const mockGetBillTextChangesForBills = vi.fn();
const mockLookbackStartIso = vi.fn((days: number) => `lookback-${days}`);

vi.mock("../d1/schema", () => ({
  ensureSchema: (...args: unknown[]) => mockEnsureSchema(...args),
}));

vi.mock("../d1/votes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../d1/votes")>();
  return {
    ...actual,
    countFeedBills: (...args: unknown[]) => mockCountFeedBills(...args),
    selectFeedBills: (...args: unknown[]) => mockSelectFeedBills(...args),
    getPassageVotesForBills: (...args: unknown[]) => mockGetPassageVotesForBills(...args),
    getCompanionVotesForBills: (...args: unknown[]) => mockGetCompanionVotesForBills(...args),
  };
});

vi.mock("../d1/bill-text-changes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../d1/bill-text-changes")>();
  return {
    ...actual,
    getBillTextChangesForBills: (...args: unknown[]) => mockGetBillTextChangesForBills(...args),
  };
});

vi.mock("../d1/digests", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../d1/digests")>();
  return {
    ...actual,
    getDigestsForBills: (...args: unknown[]) => mockGetDigestsForBills(...args),
  };
});

vi.mock("../d1/executive", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../d1/executive")>();
  return {
    ...actual,
    getExecutivePostBillsForBills: (...args: unknown[]) =>
      mockGetExecutivePostBillsForBills(...args),
    getExecutivePostBillsForPosts: (...args: unknown[]) =>
      mockGetExecutivePostBillsForPosts(...args),
  };
});

vi.mock("../d1/lifecycle", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../d1/lifecycle")>();
  return {
    ...actual,
    getLifecyclesForBills: (...args: unknown[]) => mockGetLifecyclesForBills(...args),
  };
});

vi.mock("../sources/congress-client", () => ({
  lookbackStartIso: (days: number) => mockLookbackStartIso(days),
}));

import { buildFeedPage, buildFeedItemForBill } from "./feed";

function createEnv(): Env {
  return {
    CONGRESS: "119",
    SESSION: "2",
    DB: {} as D1Database,
    CONGRESS_API_KEY: "test",
    OPENROUTER_API_KEY: "test",
  };
}

const hr6644Lifecycle: LifecycleRow = {
  congress: 119,
  bill_type: "HR",
  bill_number: 6644,
  introduced_date: "2025-12-11",
  presented_date: "2026-06-29",
  signed_date: null,
  vetoed_date: null,
  became_law_date: null,
  law_kind: null,
  public_law: null,
  latest_action_date: "2026-06-29",
  latest_action_text: "Presented to President.",
  updated_at: "2026-07-01T00:00:00.000Z",
};

describe("buildFeedPage lifecycle attachment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureSchema.mockResolvedValue(undefined);
    mockCountFeedBills.mockResolvedValue(1);
    mockSelectFeedBills.mockResolvedValue([
      {
        bill_congress: 119,
        bill_type: "HR",
        bill_number: 6644,
        latest_passage_date: "2026-06-22",
        latest_activity_date: "2026-06-22",
      },
    ]);
    mockGetDigestsForBills.mockResolvedValue(
      new Map([
        [
          "119:HR:6644",
          {
            congress: 119,
            bill_type: "HR",
            number: 6644,
            title: "21st Century ROAD to Housing Act",
            policy_area: "Housing",
            raw_summary_text: null,
            digest_json: null,
          },
        ],
      ])
    );
    mockGetPassageVotesForBills.mockResolvedValue(new Map([["119:HR:6644", []]]));
    mockGetExecutivePostBillsForBills.mockResolvedValue(new Map([["119:HR:6644", []]]));
    mockGetExecutivePostBillsForPosts.mockResolvedValue(new Map());
    mockGetLifecyclesForBills.mockResolvedValue(
      new Map([["119:HR:6644", hr6644Lifecycle]])
    );
    mockGetCompanionVotesForBills.mockResolvedValue(new Map([["119:HR:6644", []]]));
    mockGetBillTextChangesForBills.mockResolvedValue(new Map());
  });

  it("forwards optional chamber to feed bill select and count", async () => {
    await buildFeedPage(createEnv(), {
      limit: 50,
      offset: 0,
      chamber: "Senate",
      now: "2026-07-03",
    });

    expect(mockCountFeedBills).toHaveBeenCalledWith(
      expect.anything(),
      "lookback-45",
      "lookback-14",
      "Senate",
      undefined
    );
    expect(mockSelectFeedBills).toHaveBeenCalledWith(
      expect.anything(),
      "lookback-45",
      "lookback-14",
      50,
      0,
      "Senate",
      undefined
    );
  });

  it("forwards optional q search to feed bill select and count", async () => {
    await buildFeedPage(createEnv(), {
      limit: 50,
      offset: 0,
      q: "housing",
      now: "2026-07-03",
    });

    expect(mockCountFeedBills).toHaveBeenCalledWith(
      expect.anything(),
      "lookback-45",
      "lookback-14",
      undefined,
      "housing"
    );
    expect(mockSelectFeedBills).toHaveBeenCalledWith(
      expect.anything(),
      "lookback-45",
      "lookback-14",
      50,
      0,
      undefined,
      "housing"
    );
  });

  it("attaches pending lifecycle with ten-day derivation (bulk read)", async () => {
    const page = await buildFeedPage(createEnv(), {
      limit: 50,
      offset: 0,
      now: "2026-07-03",
    });

    expect(mockGetLifecyclesForBills).toHaveBeenCalledOnce();
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.lifecycle).toEqual({
      introduced_date: "2025-12-11",
      presented_date: "2026-06-29",
      signed_date: null,
      vetoed_date: null,
      became_law_date: null,
      law_kind: null,
      public_law: null,
      latest_action_date: "2026-06-29",
      latest_action_text: "Presented to President.",
      derived: {
        status: "pending_signature",
        day_of_ten: 4,
        deadline_date: "2026-07-10",
        becomes_law_on: "2026-07-11",
      },
    });
  });

  it("derives law_unsigned after the ten-day window lapses", async () => {
    const page = await buildFeedPage(createEnv(), {
      limit: 50,
      offset: 0,
      now: "2026-07-11",
    });

    expect(page.items[0]?.lifecycle?.derived).toEqual({
      status: "law_unsigned_derived",
      day_of_ten: null,
      deadline_date: "2026-07-10",
      becomes_law_on: "2026-07-11",
    });
  });

  it("sets lifecycle null when no stored row exists", async () => {
    mockGetLifecyclesForBills.mockResolvedValue(new Map());
    const page = await buildFeedPage(createEnv(), { limit: 50, offset: 0 });
    expect(page.items[0]?.lifecycle).toBeNull();
  });

  it("preserves feed page response shape with batch reads", async () => {
    mockGetPassageVotesForBills.mockResolvedValue(
      new Map([
        [
          "119:HR:6644",
          [
            {
              chamber: "House",
              congress: 119,
              session: 2,
              roll_number: 10,
              question: "On Passage",
              result: "Passed",
              yeas: 220,
              nays: 200,
              vote_date: "2026-06-22",
            },
          ],
        ],
      ])
    );
    mockGetDigestsForBills.mockResolvedValue(
      new Map([
        [
          "119:HR:6644",
          {
            congress: 119,
            bill_type: "HR",
            number: 6644,
            title: "21st Century ROAD to Housing Act",
            policy_area: "Housing",
            raw_summary_text: "Raw CRS",
            digest_json: JSON.stringify({
              headline: "Housing rewrite",
              what_it_does: "Does housing things",
            }),
          },
        ],
      ])
    );

    const page = await buildFeedPage(createEnv(), { limit: 50, offset: 0 });

    expect(mockGetDigestsForBills).toHaveBeenCalled();
    expect(mockGetPassageVotesForBills).toHaveBeenCalledOnce();
    expect(mockGetExecutivePostBillsForBills).toHaveBeenCalledOnce();
    expect(page).toMatchObject({
      total: 1,
      limit: 50,
      offset: 0,
      has_more: false,
    });
    expect(page.items[0]).toMatchObject({
      bill: {
        congress: 119,
        type: "HR",
        number: 6644,
        title: "21st Century ROAD to Housing Act",
      },
      policy_area: "Housing",
      digest: {
        headline: "Housing rewrite",
        what_it_does: "Does housing things",
      },
      raw_summary_text: "Raw CRS",
      passage_votes: [
        {
          chamber: "House",
          congress: 119,
          session: 2,
          roll_number: 10,
          question: "On Passage",
          result: "Passed",
          yeas: 220,
          nays: 200,
          date: "2026-06-22",
        },
      ],
      latest_passage_date: "2026-06-22",
      latest_activity_date: "2026-06-22",
      executive_signals: [],
      related_executive_bills: [],
    });
  });

  it("keeps vote-only latest_passage_date when executive activity is newer", async () => {
    mockSelectFeedBills.mockResolvedValue([
      {
        bill_congress: 119,
        bill_type: "HR",
        bill_number: 6644,
        latest_passage_date: "2026-04-10",
        latest_activity_date: "2026-06-24T14:26:00.000Z",
      },
    ]);
    mockGetPassageVotesForBills.mockResolvedValue(
      new Map([
        [
          "119:HR:6644",
          [
            {
              chamber: "House",
              congress: 119,
              session: 2,
              roll_number: 10,
              question: "On Passage",
              result: "Passed",
              yeas: 220,
              nays: 200,
              vote_date: "2026-04-10",
            },
          ],
        ],
      ])
    );
    mockGetExecutivePostBillsForBills.mockResolvedValue(
      new Map([
        [
          "119:HR:6644",
          [
            {
              id: "post-1",
              platform: "truth_social",
              author: "realDonaldTrump",
              text: "Quote",
              posted_at: "2026-06-24T14:26:00.000Z",
              source_url: "https://example.com/post",
              archive_url: null,
              summary: "Executive post",
              raw_json: null,
              ingested_at: "2026-06-24T15:00:00.000Z",
              role: "support",
              rationale: null,
              bill_congress: 119,
              bill_type: "HR",
              bill_number: 6644,
            },
          ],
        ],
      ])
    );

    const page = await buildFeedPage(createEnv(), { limit: 50, offset: 0 });

    expect(page.items[0]).toMatchObject({
      latest_passage_date: "2026-04-10",
      latest_activity_date: "2026-06-24T14:26:00.000Z",
    });
  });

  it("returns null latest_passage_date for executive-only feed bills", async () => {
    mockSelectFeedBills.mockResolvedValue([
      {
        bill_congress: 119,
        bill_type: "HR",
        bill_number: 22,
        latest_passage_date: null,
        latest_activity_date: "2026-06-24T14:26:00.000Z",
      },
    ]);
    mockGetPassageVotesForBills.mockResolvedValue(new Map());
    mockGetExecutivePostBillsForBills.mockResolvedValue(
      new Map([
        [
          "119:HR:22",
          [
            {
              id: "post-exec-only",
              platform: "truth_social",
              author: "realDonaldTrump",
              text: "Quote",
              posted_at: "2026-06-24T14:26:00.000Z",
              source_url: "https://example.com/post",
              archive_url: null,
              summary: "Executive post",
              raw_json: null,
              ingested_at: "2026-06-24T15:00:00.000Z",
              role: "support",
              rationale: null,
              bill_congress: 119,
              bill_type: "HR",
              bill_number: 22,
            },
          ],
        ],
      ])
    );

    const page = await buildFeedPage(createEnv(), { limit: 50, offset: 0 });

    expect(page.items[0]).toMatchObject({
      latest_passage_date: null,
      latest_activity_date: "2026-06-24T14:26:00.000Z",
      passage_votes: [],
    });
  });
});

describe("buildFeedItemForBill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnsureSchema.mockResolvedValue(undefined);
    mockGetDigestsForBills.mockResolvedValue(new Map());
    mockGetPassageVotesForBills.mockResolvedValue(new Map());
    mockGetExecutivePostBillsForBills.mockResolvedValue(new Map());
    mockGetExecutivePostBillsForPosts.mockResolvedValue(new Map());
    mockGetLifecyclesForBills.mockResolvedValue(new Map());
    mockGetCompanionVotesForBills.mockResolvedValue(new Map());
    mockGetBillTextChangesForBills.mockResolvedValue(new Map());
  });

  it("returns a full item for a bill whose passage vote is outside the feed lookback", async () => {
    mockGetDigestsForBills.mockResolvedValue(
      new Map([
        [
          "119:HR:100",
          {
            congress: 119,
            bill_type: "HR",
            number: 100,
            title: "Old Passage Bill",
            policy_area: "Energy",
            raw_summary_text: "CRS text",
            digest_json: JSON.stringify({
              headline: "Funds energy grid",
              what_it_does: "Pays for transmission.",
              key_points: [],
              terms_explained: [],
            }),
          },
        ],
      ])
    );
    mockGetPassageVotesForBills.mockResolvedValue(
      new Map([
        [
          "119:HR:100",
          [
            {
              chamber: "House",
              congress: 119,
              session: 1,
              roll_number: 40,
              question: "On Passage",
              result: "Passed",
              yeas: 230,
              nays: 190,
              vote_date: "2026-01-05",
            },
          ],
        ],
      ])
    );
    mockGetLifecyclesForBills.mockResolvedValue(
      new Map([
        [
          "119:HR:100",
          {
            congress: 119,
            bill_type: "HR",
            bill_number: 100,
            introduced_date: "2025-11-01",
            presented_date: "2026-01-20",
            signed_date: "2026-02-01",
            vetoed_date: null,
            became_law_date: "2026-02-01",
            law_kind: "signed",
            public_law: "119-8",
            latest_action_date: "2026-02-01",
            latest_action_text: "Became Public Law No: 119-8.",
            updated_at: "2026-02-01T00:00:00.000Z",
          },
        ],
      ])
    );
    mockGetCompanionVotesForBills.mockResolvedValue(
      new Map([
        [
          "119:HR:100",
          [
            {
              chamber: "House",
              congress: 119,
              session: 1,
              roll_number: 39,
              question: "On Agreeing to the Resolution",
              result: "Passed",
              yeas: 218,
              nays: 210,
              vote_date: "2026-01-04",
            },
          ],
        ],
      ])
    );

    const item = await buildFeedItemForBill(createEnv(), {
      congress: 119,
      billType: "hr",
      billNumber: 100,
      now: "2026-07-28",
    });

    expect(mockSelectFeedBills).not.toHaveBeenCalled();
    expect(mockCountFeedBills).not.toHaveBeenCalled();
    expect(mockGetPassageVotesForBills).toHaveBeenCalledWith(expect.anything(), [
      { congress: 119, billType: "HR", billNumber: 100 },
    ]);
    expect(item).toMatchObject({
      bill: {
        congress: 119,
        type: "HR",
        number: 100,
        title: "Old Passage Bill",
      },
      policy_area: "Energy",
      digest: {
        headline: "Funds energy grid",
        what_it_does: "Pays for transmission.",
      },
      passage_votes: [
        {
          chamber: "House",
          roll_number: 40,
          date: "2026-01-05",
        },
      ],
      companion_votes: [
        {
          chamber: "House",
          roll_number: 39,
          date: "2026-01-04",
        },
      ],
      latest_passage_date: "2026-01-05",
      latest_activity_date: "2026-02-01",
      lifecycle: {
        became_law_date: "2026-02-01",
        law_kind: "signed",
        public_law: "119-8",
      },
    });
  });

  it("returns null for a completely unknown bill", async () => {
    const item = await buildFeedItemForBill(createEnv(), {
      congress: 119,
      billType: "HR",
      billNumber: 99999,
    });
    expect(item).toBeNull();
  });
});
