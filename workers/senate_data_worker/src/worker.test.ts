import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./pipeline/run-feed-with-member-votes", () => ({
  runFeedWithMemberVotes: vi.fn(),
}));

vi.mock("./pipeline/run-executive-posts", () => ({
  runExecutivePostsPipeline: vi.fn(),
}));

vi.mock("./d1/pipeline-state", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./d1/pipeline-state")>();
  return {
    ...actual,
    recordFeedPipelineSkipped: vi.fn(actual.recordFeedPipelineSkipped),
  };
});

const withPipelineLeaseMock = vi.fn(
  async <T>(_db: D1Database, fn: () => Promise<T>) => fn(),
);

vi.mock("./d1/pipeline-lease", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./d1/pipeline-lease")>();
  return {
    ...actual,
    withPipelineLease: <T>(db: D1Database, fn: () => Promise<T>) =>
      withPipelineLeaseMock(db, fn),
  };
});

import { PipelineBusyError } from "./d1/pipeline-lease";
import { recordFeedPipelineSkipped } from "./d1/pipeline-state";
import {
  EXECUTIVE_POSTS_CRON_UTC,
  FEED_PIPELINE_CRON_UTC,
  PIPELINE_LEASE_TTL_MS,
} from "./constants";
import { runExecutivePostsPipeline } from "./pipeline/run-executive-posts";
import { runFeedWithMemberVotes } from "./pipeline/run-feed-with-member-votes";
import handler from "./worker";

function createMockDb(): D1Database {
  const runResult = { success: true, meta: { duration: 0, changes: 1 } };
  const stmt = () => ({
    bind: vi.fn(() => stmt()),
    all: vi.fn(async () => ({ results: [] })),
    first: vi.fn(async () => null),
    run: vi.fn(async () => runResult),
  });
  return {
    exec: vi.fn(async () => {}),
    prepare: vi.fn(() => stmt()),
  } as unknown as D1Database;
}

function createMockEnv() {
  return {
    CONGRESS: "119",
    SESSION: "2",
    DB: createMockDb(),
    CONGRESS_API_KEY: "test",
    OPENROUTER_API_KEY: "test",
  };
}

function createScheduledContext() {
  let pending: Promise<unknown> | undefined;
  const ctx = {
    waitUntil(promise: Promise<unknown>) {
      pending = promise;
    },
  } as ExecutionContext;

  return {
    ctx,
    awaitScheduled: async () => {
      if (!pending) throw new Error("scheduled handler did not call waitUntil");
      await pending;
    },
  };
}

describe("worker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withPipelineLeaseMock.mockImplementation(
      async <T>(_db: D1Database, fn: () => Promise<T>) => fn(),
    );
  });

  it("returns health", async () => {
    const response = await handler.fetch(
      new Request("http://127.0.0.1:8787/health"),
      createMockEnv() as any
    );
    const body = (await response.json()) as {
      status: string;
      congress: string;
      session: string;
      data?: { ingest?: { status: string } };
    };
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: "degraded", congress: "119", session: "2" });
    expect(body.data?.ingest?.status).toBe("unknown");
  });

  it("serves feed endpoint", async () => {
    const response = await handler.fetch(
      new Request("http://127.0.0.1:8787/feed/latest.json"),
      createMockEnv() as any
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [],
      total: 0,
      limit: 50,
      offset: 0,
      has_more: false,
    });
  });

  it("logs feed pipeline completion on scheduled", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.mocked(runFeedWithMemberVotes).mockResolvedValue({
      votesUpserted: 1,
      votesSkipped: 2,
      billsSelected: 3,
      digestsWritten: 1,
      digestsSkipped: 2,
      digestsRewritten: 1,
      digestWarnings: [],
      chamberWarnings: [],
      lifecycleRefreshed: 0,
      lifecycleSkipped: 0,
      lifecycleWarnings: [],
      textChangesRefreshed: 0,
      textChangesWithAddedProvisions: 0,
      textChangesWarnings: [],
      confirmationVotesUpserted: 0,
      confirmationNominationsFetched: 0,
      confirmationBackgroundsRewritten: 0,
      confirmationWikipediaLookups: 0,
      confirmationVoteContextsWritten: 0,
      confirmationWarnings: [],
      introsDiscovered: 0,
      introsPersisted: 0,
      introWarnings: [],
      memberVotes: {
        rollsProcessed: 1,
        rollsSkipped: 0,
        rollsAttempted: 1,
        rollsRemaining: 0,
        membersUpserted: 2,
        votesUpserted: 400,
        statsRepaired: false,
        statsFullRebuild: false,
        statsRollsRepaired: 0,
        statsRollsRemaining: 0,
      },
    });

    const { ctx, awaitScheduled } = createScheduledContext();
    handler.scheduled(
      { cron: FEED_PIPELINE_CRON_UTC, scheduledTime: 1_234 } as ScheduledController,
      createMockEnv() as any,
      ctx,
    );
    await awaitScheduled();

    expect(runFeedWithMemberVotes).toHaveBeenCalledWith(expect.anything(), {
      trigger: "scheduled",
    });
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('"event":"feed_pipeline_complete"'),
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"votesUpserted":1'));
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('"memberVotes"'));
    log.mockRestore();
  });

  it("logs feed pipeline failures on scheduled", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(runFeedWithMemberVotes).mockRejectedValue(new Error("pipeline boom"));

    const { ctx, awaitScheduled } = createScheduledContext();
    handler.scheduled(
      { cron: FEED_PIPELINE_CRON_UTC, scheduledTime: 1_234 } as ScheduledController,
      createMockEnv() as any,
      ctx,
    );

    await expect(awaitScheduled()).rejects.toThrow("pipeline boom");
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining('"event":"feed_pipeline_failed"'),
    );
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('"stack":'));
    errorLog.mockRestore();
  });

  it("records a durable skip when the feed cron loses the write lease", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    withPipelineLeaseMock.mockRejectedValueOnce(new PipelineBusyError("writes"));

    const env = createMockEnv();
    const { ctx, awaitScheduled } = createScheduledContext();
    handler.scheduled(
      { cron: FEED_PIPELINE_CRON_UTC, scheduledTime: 1_234 } as ScheduledController,
      env as any,
      ctx,
    );
    await awaitScheduled();

    expect(runFeedWithMemberVotes).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('"event":"feed_pipeline_skipped_busy"'),
    );
    expect(recordFeedPipelineSkipped).toHaveBeenCalledWith(env.DB, "scheduled", "pipeline_busy");
    log.mockRestore();
  });

  it("runs executive posts pipeline on hourly cron", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.mocked(runExecutivePostsPipeline).mockResolvedValue({
      fetched: 5,
      ingested: 1,
      linked: 1,
      hydrated: 2,
      skipped: 4,
    });

    const { ctx, awaitScheduled } = createScheduledContext();
    handler.scheduled(
      { cron: EXECUTIVE_POSTS_CRON_UTC, scheduledTime: 1_234 } as ScheduledController,
      createMockEnv() as any,
      ctx,
    );
    await awaitScheduled();

    expect(EXECUTIVE_POSTS_CRON_UTC).toBe("20 * * * *");
    expect(runExecutivePostsPipeline).toHaveBeenCalled();
    expect(runFeedWithMemberVotes).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('"event":"executive_posts_pipeline_complete"'),
    );
    log.mockRestore();
  });

  it("warns on unknown cron expressions", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { ctx } = createScheduledContext();
    handler.scheduled(
      { cron: "0 0 * * *", scheduledTime: 1_234 } as ScheduledController,
      createMockEnv() as any,
      ctx,
    );

    expect(runFeedWithMemberVotes).not.toHaveBeenCalled();
    expect(runExecutivePostsPipeline).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('"event":"scheduled_unknown_cron"'),
    );
    warn.mockRestore();
  });

  it("keeps the write lease alive until after the next executive firing", () => {
    const dailyMinute = Number(FEED_PIPELINE_CRON_UTC.split(" ")[0]);
    const executiveMinute = Number(EXECUTIVE_POSTS_CRON_UTC.split(" ")[0]);
    expect(dailyMinute).not.toBe(executiveMinute);

    // Both crons take the one global lease. If it expires while a long daily
    // ingest is still running, the next hourly firing acquires it and writes
    // alongside that run, so the TTL has to outlast the gap between them.
    const gapMinutes = (executiveMinute - dailyMinute + 60) % 60;
    expect(PIPELINE_LEASE_TTL_MS).toBeGreaterThan(gapMinutes * 60 * 1000);
  });
});
