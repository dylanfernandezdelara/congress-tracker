import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FeedItem, FeedPageResponse } from "../types";
import {
  recordExecutivePostsPipelineSuccess,
} from "../d1/pipeline-state";
import { resetSchemaFlag } from "../d1/schema";
import { runMembersRosterPipeline } from "../pipeline/run-members-roster";
import { handlePublicFetch } from "./router";
import {
  createMockEnv,
  createPipelineStateMockDb,
  pipelineRequest,
} from "./test-fixtures";

vi.mock("../pipeline/run-members-roster", () => ({
  runMembersRosterPipeline: vi.fn(async () => ({
    congress: 119,
    membersUpserted: 535,
    house: 435,
    senate: 100,
  })),
}));

vi.mock("../pipeline/run-member-votes", () => ({
  runMemberVotesPipeline: vi.fn(async () => ({
    rollsProcessed: 0,
    rollsSkipped: 0,
    rollsRemaining: 0,
    membersUpserted: 0,
    votesUpserted: 0,
  })),
}));

const mockBuildFeedPage = vi.fn();

vi.mock("../storage/feed", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../storage/feed")>();
  return {
    ...actual,
    buildFeedPage: (...args: Parameters<typeof actual.buildFeedPage>) =>
      mockBuildFeedPage(...args),
  };
});

const mockBuildRecentLaws = vi.fn();

vi.mock("../storage/recent-laws", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../storage/recent-laws")>();
  return {
    ...actual,
    buildRecentLaws: (...args: Parameters<typeof actual.buildRecentLaws>) =>
      mockBuildRecentLaws(...args),
  };
});

const mockBuildRecentConfirmations = vi.fn();

vi.mock("../storage/recent-confirmations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../storage/recent-confirmations")>();
  return {
    ...actual,
    buildRecentConfirmations: (...args: Parameters<typeof actual.buildRecentConfirmations>) =>
      mockBuildRecentConfirmations(...args),
  };
});

const mockBuildTightnessStats = vi.fn();

vi.mock("../storage/tightness-stats", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../storage/tightness-stats")>();
  return {
    ...actual,
    buildTightnessStats: (...args: Parameters<typeof actual.buildTightnessStats>) =>
      mockBuildTightnessStats(...args),
  };
});

const mockWithPipelineLease = vi.fn(
  async <T>(_db: D1Database, fn: () => Promise<T>, _options?: unknown) => fn()
);

vi.mock("../d1/pipeline-lease", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../d1/pipeline-lease")>();
  return {
    ...actual,
    withPipelineLease: <T>(
      db: D1Database,
      fn: () => Promise<T>,
      options?: Parameters<typeof actual.withPipelineLease>[2]
    ) => mockWithPipelineLease(db, fn, options),
  };
});

function feedItem(
  number: number,
  passageChambers: Array<"House" | "Senate">
): FeedItem {
  return {
    bill: { congress: 119, type: "HR", number, title: `Bill ${number}` },
    policy_area: null,
    digest: null,
    raw_summary_text: null,
    passage_votes: passageChambers.map((chamber, index) => ({
      chamber,
      congress: 119,
      session: 2,
      roll_number: number * 10 + index,
      question: "On Passage",
      result: "Passed",
      yeas: 200,
      nays: 100,
      date: `2026-06-${String(10 + index).padStart(2, "0")}`,
    })),
    latest_passage_date: "2026-06-11",
    latest_activity_date: "2026-06-11",
    lifecycle: null,
    executive_signals: [],
    related_executive_bills: [],
  };
}

/** Fixture mirror of chamber filter: bills with a passage vote in that chamber. */
const FEED_FIXTURE: FeedItem[] = [
  feedItem(1, ["House"]),
  feedItem(2, ["Senate"]),
  feedItem(3, ["House", "Senate"]),
];

function emptyFeedPage(options: {
  limit: number;
  offset: number;
}): FeedPageResponse {
  return {
    items: [],
    total: 0,
    limit: options.limit,
    offset: options.offset,
    has_more: false,
  };
}

function filteredFeedPage(options: {
  limit: number;
  offset: number;
  chamber?: "House" | "Senate";
  q?: string;
  state?: string;
}): FeedPageResponse {
  let filtered = options.chamber
    ? FEED_FIXTURE.filter((item) =>
        item.passage_votes.some((vote) => vote.chamber === options.chamber)
      )
    : FEED_FIXTURE;
  if (options.state) {
    // Fixture: bill 1 → NY, bill 2 → TX, bill 3 → CA (mirrors seed sponsor mapping).
    const byNumber: Record<number, string> = { 1: "NY", 2: "TX", 3: "CA" };
    filtered = filtered.filter((item) => byNumber[item.bill.number] === options.state);
  }
  if (options.q) {
    const needle = options.q.toLowerCase();
    filtered = filtered.filter(
      (item) =>
        (item.bill.title ?? "").toLowerCase().includes(needle) ||
        (item.policy_area ?? "").toLowerCase().includes(needle) ||
        (item.digest?.headline ?? "").toLowerCase().includes(needle) ||
        `${item.bill.type}${item.bill.number}`.toLowerCase().includes(needle.replace(/[^a-z0-9]/gi, ""))
    );
  }
  const total = filtered.length;
  const items = filtered.slice(options.offset, options.offset + options.limit);
  return {
    items,
    total,
    limit: options.limit,
    offset: options.offset,
    has_more: options.offset + items.length < total,
  };
}

describe("HTTP API", () => {
  beforeEach(() => {
    mockWithPipelineLease.mockReset();
    mockWithPipelineLease.mockImplementation(async (_db, fn) => fn());
    mockBuildFeedPage.mockReset();
    mockBuildFeedPage.mockImplementation(async (_env, options) => emptyFeedPage(options));
    mockBuildRecentLaws.mockReset();
    mockBuildRecentLaws.mockImplementation(
      async (_env, congress: number, session: number, limit: number, asOf?: string) => ({
        congress,
        session,
        laws: Array.from({ length: Math.min(limit, 3) }, (_, i) => ({
          congress,
          bill_type: "HR",
          bill_number: i + 1,
          title: `Law ${i + 1}`,
          policy_area: null,
          headline: `Headline ${i + 1}`,
          became_law_date: `2026-07-${String(15 - i).padStart(2, "0")}`,
          law_kind: "signed" as const,
          public_law: `119-${i + 1}`,
          signed_date: `2026-07-${String(15 - i).padStart(2, "0")}`,
          presented_date: null,
          latest_action_date: null,
          latest_action_text: null,
          latest_passage_vote_date: null,
          item: null,
        })),
        as_of: asOf ?? "2026-07-28T00:00:00.000Z",
      })
    );
    mockBuildRecentConfirmations.mockReset();
    mockBuildRecentConfirmations.mockImplementation(
      async (_env, congress: number, session: number, limit: number, asOf?: string) => ({
        congress,
        session,
        confirmations: Array.from({ length: Math.min(limit, 2) }, (_, i) => ({
          chamber: "Senate" as const,
          congress,
          session,
          roll_number: 9000 + i,
          citation: `PN${100 + i}`,
          nomination_number: 100 + i,
          part_number: 0,
          nominee_names: [{ display_name: `Nominee ${i + 1}`, state: "CA" }],
          position_title: "Secretary of Energy",
          organization: "Department of Energy",
          description: `Nominee ${i + 1} confirmation sample`,
          question: "On the Nomination",
          result: "Confirmed",
          yeas: 58,
          nays: 40,
          vote_date: `2026-07-${String(14 - i).padStart(2, "0")}`,
          headline: `Nominee ${i + 1} confirmed as Energy Secretary`,
          what_was_confirmed: "The Senate confirmed the nominee.",
          background: "A short background for local tests.",
          key_points: [],
          congress_gov_url: `https://www.congress.gov/nomination/${congress}th-congress/${100 + i}`,
        })),
        as_of: asOf ?? "2026-07-28T00:00:00.000Z",
      })
    );
    mockBuildTightnessStats.mockReset();
    mockBuildTightnessStats.mockImplementation(
      async (_env, congress: number, session: number, asOf?: string) => ({
        congress,
        session,
        house_passage: [],
        senate: [],
        senate_waiting: [],
        as_of: asOf ?? "2026-07-28T00:00:00.000Z",
      })
    );
  });

  it("returns health", async () => {
    const response = await handlePublicFetch(
      new Request("https://worker.example.com/health"),
      createMockEnv() as any
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      status: string;
      congress: string;
      data?: { ingest?: { status: string; daily_cron_utc: string } };
    };
    expect(body).toMatchObject({ status: "degraded", congress: "119" });
    expect(body.data?.ingest).toMatchObject({
      status: "unknown",
      daily_cron_utc: "0 10 * * *",
    });
  });

  it("returns ingest monitor JSON", async () => {
    const response = await handlePublicFetch(
      new Request("https://worker.example.com/debug/ingest.json"),
      createMockEnv() as any
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ingest: {
        status: string;
        stale_after_hours: number;
        last_skipped: unknown;
        executive?: { hourly_cron_utc: string };
      };
      alerting: unknown;
    };
    expect(body.ingest).toMatchObject({
      status: "unknown",
      stale_after_hours: 26,
      last_skipped: null,
    });
    expect(body.ingest.executive?.hourly_cron_utc).toBe("20 * * * *");
    expect(body.alerting).toBeDefined();
  });

  it("keeps executive ingest monitor ok after a later admin success", async () => {
    resetSchemaFlag();
    const db = createPipelineStateMockDb();
    await recordExecutivePostsPipelineSuccess(db, "scheduled", {
      fetched: 3,
      ingested: 2,
      linked: 1,
      hydrated: 1,
      skipped: 0,
    });
    await recordExecutivePostsPipelineSuccess(db, "admin", {
      fetched: 1,
      ingested: 1,
      linked: 0,
      hydrated: 0,
      skipped: 0,
    });

    const response = await handlePublicFetch(
      new Request("https://worker.example.com/debug/ingest.json"),
      createMockEnv({ DB: db }) as any
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ingest: {
        executive?: {
          status: string;
          last_success: { trigger: string } | null;
          last_scheduled_success: { trigger: string; fetched: number } | null;
        };
      };
    };

    expect(body.ingest.executive?.last_success?.trigger).toBe("admin");
    expect(body.ingest.executive?.last_scheduled_success).toMatchObject({
      trigger: "scheduled",
      fetched: 3,
    });
    expect(body.ingest.executive?.status).toBe("ok");
  });

  it("returns empty feed page", async () => {
    const response = await handlePublicFetch(
      new Request("https://worker.example.com/feed/latest.json"),
      createMockEnv() as any
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      items: [],
      total: 0,
      limit: 50,
      offset: 0,
      has_more: false,
    });
  });

  it("parses feed pagination query params", async () => {
    const response = await handlePublicFetch(
      new Request("https://worker.example.com/feed/latest.json?limit=5&offset=10"),
      createMockEnv() as any
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      items: [],
      total: 0,
      limit: 5,
      offset: 10,
      has_more: false,
    });
  });

  it("clamps feed offset to the max paginable window", async () => {
    const response = await handlePublicFetch(
      new Request("https://worker.example.com/feed/latest.json?limit=5&offset=999"),
      createMockEnv() as any
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ limit: 5, offset: 45 });
  });

  it("filters feed by chamber=House to bills with a House passage vote", async () => {
    mockBuildFeedPage.mockImplementation(async (_env, options) => filteredFeedPage(options));
    const response = await handlePublicFetch(
      new Request("https://worker.example.com/feed/latest.json?chamber=House"),
      createMockEnv() as any
    );
    expect(response.status).toBe(200);
    expect(mockBuildFeedPage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ chamber: "House" })
    );
    const body = (await response.json()) as FeedPageResponse;
    expect(body.total).toBe(2);
    expect(body.has_more).toBe(false);
    expect(body.items.map((item) => item.bill.number)).toEqual([1, 3]);
    expect(body.items.every((item) => item.passage_votes.some((v) => v.chamber === "House"))).toBe(
      true
    );
    const both = body.items.find((item) => item.bill.number === 3);
    expect(both?.passage_votes.map((v) => v.chamber)).toEqual(["House", "Senate"]);
  });

  it("filters feed by chamber=Senate to bills with a Senate passage vote", async () => {
    mockBuildFeedPage.mockImplementation(async (_env, options) => filteredFeedPage(options));
    const response = await handlePublicFetch(
      new Request("https://worker.example.com/feed/latest.json?chamber=Senate"),
      createMockEnv() as any
    );
    expect(response.status).toBe(200);
    expect(mockBuildFeedPage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ chamber: "Senate" })
    );
    const body = (await response.json()) as FeedPageResponse;
    expect(body.total).toBe(2);
    expect(body.items.map((item) => item.bill.number)).toEqual([2, 3]);
    expect(body.items.every((item) => item.passage_votes.some((v) => v.chamber === "Senate"))).toBe(
      true
    );
  });

  it("includes bills passed by both chambers under either chamber filter", async () => {
    mockBuildFeedPage.mockImplementation(async (_env, options) => filteredFeedPage(options));
    const house = (await (
      await handlePublicFetch(
        new Request("https://worker.example.com/feed/latest.json?chamber=House"),
        createMockEnv() as any
      )
    ).json()) as FeedPageResponse;
    const senate = (await (
      await handlePublicFetch(
        new Request("https://worker.example.com/feed/latest.json?chamber=Senate"),
        createMockEnv() as any
      )
    ).json()) as FeedPageResponse;
    expect(house.items.some((item) => item.bill.number === 3)).toBe(true);
    expect(senate.items.some((item) => item.bill.number === 3)).toBe(true);
  });

  it("rejects invalid feed chamber values with bad_request", async () => {
    const response = await handlePublicFetch(
      new Request("https://worker.example.com/feed/latest.json?chamber=house"),
      createMockEnv() as any
    );
    expect(response.status).toBe(400);
    expect(mockBuildFeedPage).not.toHaveBeenCalled();
    const body = await response.json();
    expect(body).toEqual({
      error: "bad_request",
      message: "chamber must be House or Senate",
    });
  });

  it("filters feed by sponsor state=NY", async () => {
    mockBuildFeedPage.mockImplementation(async (_env, options) => filteredFeedPage(options));
    const response = await handlePublicFetch(
      new Request("https://worker.example.com/feed/latest.json?state=ny"),
      createMockEnv() as any
    );
    expect(response.status).toBe(200);
    expect(mockBuildFeedPage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ state: "NY" })
    );
    const body = (await response.json()) as FeedPageResponse;
    expect(body.total).toBe(1);
    expect(body.items.map((item) => item.bill.number)).toEqual([1]);
  });

  it("forwards advanced sponsor and policy filters to buildFeedPage", async () => {
    mockBuildFeedPage.mockResolvedValue({
      items: [],
      total: 0,
      limit: 50,
      offset: 0,
      has_more: false,
    });
    const response = await handlePublicFetch(
      new Request(
        "https://worker.example.com/feed/latest.json?sponsor_chamber=Senate&party=D&sponsor=A000001&sponsor_q=Schumer&policy=Energy"
      ),
      createMockEnv() as any
    );
    expect(response.status).toBe(200);
    expect(mockBuildFeedPage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sponsorChamber: "Senate",
        party: "D",
        sponsor: "A000001",
        // Exact sponsor wins; free-text name is dropped when both are present.
        sponsorQ: undefined,
        policy: "Energy",
      })
    );
  });

  it("rejects invalid sponsor_chamber and party values", async () => {
    const badChamber = await handlePublicFetch(
      new Request("https://worker.example.com/feed/latest.json?sponsor_chamber=Congress"),
      createMockEnv() as any
    );
    expect(badChamber.status).toBe(400);
    const badParty = await handlePublicFetch(
      new Request("https://worker.example.com/feed/latest.json?party=Green"),
      createMockEnv() as any
    );
    expect(badParty.status).toBe(400);
  });

  it("rejects invalid feed state values with bad_request", async () => {
    const response = await handlePublicFetch(
      new Request("https://worker.example.com/feed/latest.json?state=New%20York"),
      createMockEnv() as any
    );
    expect(response.status).toBe(400);
    expect(mockBuildFeedPage).not.toHaveBeenCalled();
    const body = await response.json();
    expect(body).toEqual({
      error: "bad_request",
      message: "state must be a 2-letter US state, DC, or territory code",
    });
  });

  it("omits state filter when state is absent or empty", async () => {
    mockBuildFeedPage.mockImplementation(async (_env, options) => filteredFeedPage(options));
    await handlePublicFetch(
      new Request("https://worker.example.com/feed/latest.json"),
      createMockEnv() as any
    );
    await handlePublicFetch(
      new Request("https://worker.example.com/feed/latest.json?state="),
      createMockEnv() as any
    );
    expect(mockBuildFeedPage).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({ state: undefined })
    );
    expect(mockBuildFeedPage).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ state: undefined })
    );
  });

  it("omits chamber filter when chamber is absent or empty", async () => {
    mockBuildFeedPage.mockImplementation(async (_env, options) => filteredFeedPage(options));
    const omitted = await handlePublicFetch(
      new Request("https://worker.example.com/feed/latest.json"),
      createMockEnv() as any
    );
    const empty = await handlePublicFetch(
      new Request("https://worker.example.com/feed/latest.json?chamber="),
      createMockEnv() as any
    );
    expect(omitted.status).toBe(200);
    expect(empty.status).toBe(200);
    expect(mockBuildFeedPage).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({ chamber: undefined })
    );
    expect(mockBuildFeedPage).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ chamber: undefined })
    );
    const omittedBody = (await omitted.json()) as FeedPageResponse;
    expect(omittedBody.total).toBe(3);
    expect(omittedBody.items).toHaveLength(3);
  });

  it("reflects filtered total and has_more for chamber pages", async () => {
    mockBuildFeedPage.mockImplementation(async (_env, options) => filteredFeedPage(options));
    const response = await handlePublicFetch(
      new Request("https://worker.example.com/feed/latest.json?chamber=House&limit=1&offset=0"),
      createMockEnv() as any
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as FeedPageResponse;
    expect(body).toMatchObject({
      total: 2,
      limit: 1,
      offset: 0,
      has_more: true,
    });
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.bill.number).toBe(1);
  });

  it("forwards q search and ignores empty/whitespace q", async () => {
    mockBuildFeedPage.mockImplementation(async (_env, options) => filteredFeedPage(options));
    await handlePublicFetch(
      new Request("https://worker.example.com/feed/latest.json?q=housing"),
      createMockEnv() as any
    );
    expect(mockBuildFeedPage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ q: "housing" })
    );

    mockBuildFeedPage.mockClear();
    await handlePublicFetch(
      new Request("https://worker.example.com/feed/latest.json?q=%20%20"),
      createMockEnv() as any
    );
    expect(mockBuildFeedPage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ q: undefined })
    );
  });

  it("silently truncates q to 100 chars", async () => {
    const long = "b".repeat(150);
    await handlePublicFetch(
      new Request(`https://worker.example.com/feed/latest.json?q=${long}`),
      createMockEnv() as any
    );
    expect(mockBuildFeedPage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ q: "b".repeat(100) })
    );
  });

  it("combines q with chamber and reflects filtered total/has_more", async () => {
    mockBuildFeedPage.mockImplementation(async (_env, options) => {
      // Fixture titles are "Bill N" — match bill 1 under House.
      if (options.q === "Bill 1") {
        return {
          items: [FEED_FIXTURE[0]!],
          total: 1,
          limit: options.limit,
          offset: options.offset,
          has_more: false,
        };
      }
      return filteredFeedPage(options);
    });
    const response = await handlePublicFetch(
      new Request(
        "https://worker.example.com/feed/latest.json?chamber=House&q=Bill%201&limit=1&offset=0"
      ),
      createMockEnv() as any
    );
    expect(response.status).toBe(200);
    expect(mockBuildFeedPage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ chamber: "House", q: "Bill 1" })
    );
    const body = (await response.json()) as FeedPageResponse;
    expect(body).toMatchObject({ total: 1, has_more: false });
    expect(body.items[0]?.bill.number).toBe(1);
  });

  it("returns session stats without roster sync side effects", async () => {
    vi.mocked(runMembersRosterPipeline).mockClear();
    const response = await handlePublicFetch(
      new Request("https://worker.example.com/stats/session.json"),
      createMockEnv() as any
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      congress: 119,
      session: 2,
      house: { passage_vote_count: 0 },
      senate: { passage_vote_count: 0 },
    });
    expect(runMembersRosterPipeline).not.toHaveBeenCalled();
  });

  it("returns pulse stats", async () => {
    const response = await handlePublicFetch(
      new Request("https://worker.example.com/stats/pulse.json"),
      createMockEnv() as any
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ congress: 119, session: 2, house: { close_votes: [] } });
  });

  it("returns tightness stats", async () => {
    const response = await handlePublicFetch(
      new Request("https://worker.example.com/stats/tightness.json"),
      createMockEnv() as any
    );
    expect(response.status).toBe(200);
    expect(mockBuildTightnessStats).toHaveBeenCalled();
    const body = await response.json();
    expect(body).toMatchObject({
      congress: 119,
      session: 2,
      house_passage: [],
      senate: [],
      senate_waiting: [],
    });
  });

  it("requires chamber for defectors", async () => {
    const response = await handlePublicFetch(
      new Request("https://worker.example.com/stats/defectors.json"),
      createMockEnv() as any
    );
    expect(response.status).toBe(400);
  });

  it("requires bioguide_id for member profile", async () => {
    const response = await handlePublicFetch(
      new Request("https://worker.example.com/stats/member.json"),
      createMockEnv() as any
    );
    expect(response.status).toBe(400);
  });

  it("returns 404 for unknown member profile", async () => {
    const response = await handlePublicFetch(
      new Request("https://worker.example.com/stats/member.json?bioguide_id=Z999999"),
      createMockEnv() as any
    );
    expect(response.status).toBe(404);
  });

  it("returns empty defectors for chamber", async () => {
    const response = await handlePublicFetch(
      new Request("https://worker.example.com/stats/defectors.json?chamber=House"),
      createMockEnv() as any
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ chamber: "House", defectors: [] });
  });

  it("returns recent laws envelope with default limit 5", async () => {
    const response = await handlePublicFetch(
      new Request("https://worker.example.com/stats/recent-laws.json"),
      createMockEnv() as any
    );
    expect(response.status).toBe(200);
    expect(mockBuildRecentLaws).toHaveBeenCalledWith(
      expect.anything(),
      119,
      2,
      5,
      expect.any(String)
    );
    const body = await response.json();
    expect(body).toMatchObject({
      congress: 119,
      session: 2,
      laws: expect.any(Array),
      as_of: expect.any(String),
    });
    expect(Array.isArray((body as { laws: unknown[] }).laws)).toBe(true);
  });

  it("respects recent-laws limit and caps at 10", async () => {
    const limited = await handlePublicFetch(
      new Request("https://worker.example.com/stats/recent-laws.json?limit=3"),
      createMockEnv() as any
    );
    expect(limited.status).toBe(200);
    expect(mockBuildRecentLaws).toHaveBeenLastCalledWith(
      expect.anything(),
      119,
      2,
      3,
      expect.any(String)
    );

    const capped = await handlePublicFetch(
      new Request("https://worker.example.com/stats/recent-laws.json?limit=99"),
      createMockEnv() as any
    );
    expect(capped.status).toBe(200);
    expect(mockBuildRecentLaws).toHaveBeenLastCalledWith(
      expect.anything(),
      119,
      2,
      10,
      expect.any(String)
    );
  });

  it("returns recent confirmations envelope with default limit 5", async () => {
    const response = await handlePublicFetch(
      new Request("https://worker.example.com/stats/recent-confirmations.json"),
      createMockEnv() as any
    );
    expect(response.status).toBe(200);
    expect(mockBuildRecentConfirmations).toHaveBeenCalledWith(
      expect.anything(),
      119,
      2,
      5,
      expect.any(String)
    );
    const body = await response.json();
    expect(body).toMatchObject({
      congress: 119,
      session: 2,
      confirmations: expect.any(Array),
      as_of: expect.any(String),
    });
  });

  it("respects recent-confirmations limit and caps at 10", async () => {
    const limited = await handlePublicFetch(
      new Request("https://worker.example.com/stats/recent-confirmations.json?limit=3"),
      createMockEnv() as any
    );
    expect(limited.status).toBe(200);
    expect(mockBuildRecentConfirmations).toHaveBeenLastCalledWith(
      expect.anything(),
      119,
      2,
      3,
      expect.any(String)
    );

    const capped = await handlePublicFetch(
      new Request("https://worker.example.com/stats/recent-confirmations.json?limit=99"),
      createMockEnv() as any
    );
    expect(capped.status).toBe(200);
    expect(mockBuildRecentConfirmations).toHaveBeenLastCalledWith(
      expect.anything(),
      119,
      2,
      10,
      expect.any(String)
    );
  });

  it("requires roll call params for vote defectors", async () => {
    const response = await handlePublicFetch(
      new Request("https://worker.example.com/feed/vote-defectors.json?chamber=House"),
      createMockEnv() as any
    );
    expect(response.status).toBe(400);
  });

  it("returns empty vote defectors for a roll call", async () => {
    const response = await handlePublicFetch(
      new Request(
        "https://worker.example.com/feed/vote-defectors.json?chamber=House&congress=119&session=2&roll_number=9001"
      ),
      createMockEnv() as any
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      chamber: "House",
      congress: 119,
      session: 2,
      roll_number: 9001,
      defectors: [],
      member_votes_available: false,
    });
  });

  it("rejects write pipelines in production when no admin token is set", async () => {
    const response = await handlePublicFetch(
      pipelineRequest("/__pipeline/run/member-votes"),
      createMockEnv({ ALLOWED_ORIGIN: "https://congress.example", DEV_OPEN_PIPELINE: undefined }) as any
    );
    expect(response.status).toBe(401);
  });

  it("allows write pipelines in local dev mode (DEV_OPEN_PIPELINE=1)", async () => {
    mockWithPipelineLease.mockImplementation(async (_db, fn) => fn());
    const response = await handlePublicFetch(
      pipelineRequest("/__pipeline/run/member-votes"),
      createMockEnv() as any
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, rollsRemaining: 0 });
  });

  it("returns 409 when another pipeline holds the write lease", async () => {
    const { PipelineBusyError } = await import("../d1/pipeline-lease");
    mockWithPipelineLease.mockRejectedValueOnce(new PipelineBusyError("writes"));
    const response = await handlePublicFetch(
      pipelineRequest("/__pipeline/run/member-votes"),
      createMockEnv() as any
    );
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, error: "pipeline_busy" });
  });

  it("allows members-roster pipeline in local dev mode", async () => {
    const response = await handlePublicFetch(
      pipelineRequest("/__pipeline/run/members-roster"),
      createMockEnv() as any
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, congress: 119, membersUpserted: 535 });
  });

  it("requires bill identifiers for digest refresh", async () => {
    const response = await handlePublicFetch(
      pipelineRequest("/__pipeline/run/digest-refresh"),
      createMockEnv() as any
    );
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, error: "pipeline_failed" });
  });

  it("purges edge cache via admin route when credentials are configured", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const response = await handlePublicFetch(
      pipelineRequest("/__pipeline/purge-cache"),
      createMockEnv({
        CF_ZONE_ID: "zone-123",
        CACHE_PURGE_TOKEN: "purge-token",
      }) as any
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      purged: true,
      mode: "everything",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/zones/zone-123/purge_cache",
      expect.objectContaining({ method: "POST" })
    );
    fetchMock.mockRestore();
  });

  it("returns 503 from purge-cache when token is unset", async () => {
    const response = await handlePublicFetch(
      pipelineRequest("/__pipeline/purge-cache"),
      createMockEnv({ CF_ZONE_ID: "zone-123" }) as any
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      skipped: true,
      reason: "CACHE_PURGE_TOKEN unset",
    });
  });

  it("requires a matching Bearer token when PIPELINE_ADMIN_TOKEN is set", async () => {
    const env = createMockEnv({
      ALLOWED_ORIGIN: "https://congress.example",
      DEV_OPEN_PIPELINE: undefined,
      PIPELINE_ADMIN_TOKEN: "s3cret",
    });
    const denied = await handlePublicFetch(
      pipelineRequest("/__pipeline/run/member-votes"),
      env as any
    );
    expect(denied.status).toBe(401);

    const allowed = await handlePublicFetch(
      pipelineRequest("/__pipeline/run/member-votes", {
        headers: { Authorization: "Bearer s3cret" },
      }),
      env as any
    );
    expect(allowed.status).toBe(200);
  });

  it("rejects pipeline writes on preview worker hostnames", async () => {
    const env = createMockEnv({
      ALLOWED_ORIGIN: "https://congress.example",
      DEV_OPEN_PIPELINE: undefined,
      PIPELINE_ADMIN_TOKEN: "s3cret",
    });
    const response = await handlePublicFetch(
      new Request(
        "https://abc123-congress-tracker-api.foo.workers.dev/__pipeline/run/member-votes",
        {
          method: "POST",
          headers: { Authorization: "Bearer s3cret" },
        }
      ),
      env as any
    );
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toMatchObject({ error: "preview_pipeline_writes_disabled" });
  });

  it("rejects GET requests to admin pipeline routes", async () => {
    const response = await handlePublicFetch(
      new Request("https://worker.example.com/__pipeline/run/member-votes"),
      createMockEnv() as any
    );
    expect(response.status).toBe(405);
  });

  it("returns 404 for unknown routes when no asset binding is present", async () => {
    const response = await handlePublicFetch(
      new Request("https://worker.example.com/briefings/latest.json"),
      createMockEnv() as any
    );
    expect(response.status).toBe(404);
  });

  it("serves the SPA shell for non-API navigations when ASSETS is bound", async () => {
    const assetResponse = new Response("<!DOCTYPE html>", { status: 200 });
    const ASSETS = { fetch: vi.fn(async () => assetResponse) };
    const response = await handlePublicFetch(
      new Request("https://worker.example.com/some/client/route"),
      createMockEnv({ ASSETS }) as any
    );
    expect(ASSETS.fetch).toHaveBeenCalledOnce();
    expect(response).toBe(assetResponse);
  });

  it("keeps JSON 404s for unknown API paths even when ASSETS is bound", async () => {
    const ASSETS = { fetch: vi.fn(async () => new Response("html")) };
    const response = await handlePublicFetch(
      new Request("https://worker.example.com/feed/does-not-exist.json"),
      createMockEnv({ ASSETS }) as any
    );
    expect(ASSETS.fetch).not.toHaveBeenCalled();
    expect(response.status).toBe(404);
  });
});
