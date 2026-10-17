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
const mockGetProcessSummariesForBills = vi.fn();
const mockGetPrimarySponsorsForBills = vi.fn();
const mockSelectPartyPositionCounts = vi.fn();
const mockHasRealMemberRoster = vi.fn();
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

vi.mock("../d1/sponsors", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../d1/sponsors")>();
  return {
    ...actual,
    getPrimarySponsorsForBills: (...args: unknown[]) => mockGetPrimarySponsorsForBills(...args),
  };
});

vi.mock("../d1/bill-process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../d1/bill-process")>();
  return {
    ...actual,
    getProcessSummariesForBills: (...args: unknown[]) =>
      mockGetProcessSummariesForBills(...args),
  };
});

vi.mock("../d1/member-votes", () => ({
  selectPartyPositionCountsForRollKeys: (...args: unknown[]) =>
    mockSelectPartyPositionCounts(...args),
}));

vi.mock("../d1/members", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../d1/members")>();
  return {
    ...actual,
    hasRealMemberRoster: (...args: unknown[]) => mockHasRealMemberRoster(...args),
  };
});

vi.mock("../sources/congress-client", () => ({
  lookbackStartIso: (days: number) => mockLookbackStartIso(days),
}));

import { buildFeedPage } from "./feed";

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
    mockGetProcessSummariesForBills.mockResolvedValue(new Map());
    mockGetPrimarySponsorsForBills.mockResolvedValue(new Map());
    mockSelectPartyPositionCounts.mockResolvedValue([]);
    mockHasRealMemberRoster.mockResolvedValue(false);
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
      "2026-06-27",
      {
        chamber: "Senate",
        q: undefined,
        state: undefined,
        sponsorChamber: undefined,
        sponsor: undefined,
        sponsorQ: undefined,
        party: undefined,
        policy: undefined,
      },
      true
    );
    expect(mockSelectFeedBills).toHaveBeenCalledWith(
      expect.anything(),
      "lookback-45",
      "lookback-14",
      "2026-06-27",
      50,
      0,
      {
        chamber: "Senate",
        q: undefined,
        state: undefined,
        sponsorChamber: undefined,
        sponsor: undefined,
        sponsorQ: undefined,
        party: undefined,
        policy: undefined,
      },
      true
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
      "2026-06-27",
      {
      chamber: undefined,
      q: "housing",
      state: undefined,
      sponsorChamber: undefined,
      sponsor: undefined,
      sponsorQ: undefined,
      party: undefined,
      policy: undefined,
    },
      true
    );
    expect(mockSelectFeedBills).toHaveBeenCalledWith(
      expect.anything(),
      "lookback-45",
      "lookback-14",
      "2026-06-27",
      50,
      0,
      {
      chamber: undefined,
      q: "housing",
      state: undefined,
      sponsorChamber: undefined,
      sponsor: undefined,
      sponsorQ: undefined,
      party: undefined,
      policy: undefined,
    },
      true
    );
  });

  it("forwards optional sponsor state to feed bill select and count", async () => {
    await buildFeedPage(createEnv(), {
      limit: 50,
      offset: 0,
      state: "NY",
      now: "2026-07-03",
    });

    expect(mockCountFeedBills).toHaveBeenCalledWith(
      expect.anything(),
      "lookback-45",
      "lookback-14",
      "2026-06-27",
      {
      chamber: undefined,
      q: undefined,
      state: "NY",
      sponsorChamber: undefined,
      sponsor: undefined,
      sponsorQ: undefined,
      party: undefined,
      policy: undefined,
    },
      true
    );
    expect(mockSelectFeedBills).toHaveBeenCalledWith(
      expect.anything(),
      "lookback-45",
      "lookback-14",
      "2026-06-27",
      50,
      0,
      {
      chamber: undefined,
      q: undefined,
      state: "NY",
      sponsorChamber: undefined,
      sponsor: undefined,
      sponsorQ: undefined,
      party: undefined,
      policy: undefined,
    },
      true
    );
  });

  it("forwards includeIntros: false to feed bill select and count", async () => {
    await buildFeedPage(createEnv(), {
      limit: 50,
      offset: 0,
      includeIntros: false,
      now: "2026-07-03",
    });

    expect(mockCountFeedBills).toHaveBeenCalledWith(
      expect.anything(),
      "lookback-45",
      "lookback-14",
      "2026-06-27",
      expect.any(Object),
      false
    );
    expect(mockSelectFeedBills).toHaveBeenCalledWith(
      expect.anything(),
      "lookback-45",
      "lookback-14",
      "2026-06-27",
      50,
      0,
      expect.any(Object),
      false
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

  it("attaches primary_sponsor when a sponsor row exists", async () => {
    mockGetPrimarySponsorsForBills.mockResolvedValue(
      new Map([
        [
          "119:HR:6644",
          {
            congress: 119,
            bill_type: "HR",
            bill_number: 6644,
            bioguide_id: "S000033",
            full_name: "Sen. Bernard Sanders (local)",
            party: "I",
            state: "VT",
          },
        ],
      ])
    );
    const page = await buildFeedPage(createEnv(), { limit: 50, offset: 0, now: "2026-07-03" });
    expect(page.items[0]?.primary_sponsor).toEqual({
      bioguide_id: "S000033",
      name: "Sen. Bernard Sanders (local)",
      party: "I",
      state: "VT",
    });
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

  describe("passage vote cohesion", () => {
    const roll = (roll_number: number) => ({
      chamber: "House",
      congress: 119,
      session: 2,
      roll_number,
      question: "On Passage",
      result: "Passed",
      yeas: 220,
      nays: 200,
      vote_date: "2026-06-22",
    });
    const count = (roll_number: number, party: string, position: string, n: number) => ({
      chamber: "House",
      congress: 119,
      session: 2,
      roll_number,
      party,
      position,
      n,
    });

    beforeEach(() => {
      mockGetPassageVotesForBills.mockResolvedValue(
        new Map([["119:HR:6644", [roll(10), roll(11), roll(12), roll(13)]]])
      );
    });

    it("labels opposed majorities party-line and agreeing ones bipartisan", async () => {
      mockSelectPartyPositionCounts.mockResolvedValue([
        count(10, "R", "Yea", 210),
        count(10, "D", "Nay", 200),
        count(10, "D", "Yea", 10),
        count(11, "R", "Yea", 200),
        count(11, "D", "Aye", 190),
        // Only Republicans recorded: no comparison to make.
        count(12, "R", "Yea", 200),
      ]);

      const page = await buildFeedPage(createEnv(), { limit: 50, offset: 0 });
      const votes = page.items[0]!.passage_votes;

      expect(votes.map((vote) => vote.cohesion)).toEqual([
        "party-line",
        "bipartisan",
        undefined,
        undefined,
      ]);
      expect(votes[3]).not.toHaveProperty("cohesion");
    });

    it("drops local sample members once a real roster exists", async () => {
      mockHasRealMemberRoster.mockResolvedValue(true);

      await buildFeedPage(createEnv(), { limit: 50, offset: 0 });

      expect(mockSelectPartyPositionCounts).toHaveBeenCalledWith(
        expect.anything(),
        119,
        2,
        expect.arrayContaining([{ chamber: "House", roll_number: 10 }]),
        { excludeLocalSample: true }
      );
    });

    it("still serves the feed when member votes cannot be read", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      mockSelectPartyPositionCounts.mockRejectedValue(new Error("D1 down"));

      const page = await buildFeedPage(createEnv(), { limit: 50, offset: 0 });

      expect(page.items).toHaveLength(1);
      expect(page.items[0]!.passage_votes.every((vote) => vote.cohesion === undefined)).toBe(true);
      expect(warn).toHaveBeenCalledWith("feed_cohesion_unavailable", expect.any(Error));
      warn.mockRestore();
    });

    it("skips the member-vote read when the caller asks", async () => {
      await buildFeedPage(createEnv(), { limit: 50, offset: 0, skipCohesion: true });

      expect(mockSelectPartyPositionCounts).not.toHaveBeenCalled();
    });
  });
});
