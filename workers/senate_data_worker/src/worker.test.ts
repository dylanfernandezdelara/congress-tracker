import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./pipeline/run-feed-with-member-votes", () => ({
  runFeedWithMemberVotes: vi.fn(),
}));

vi.mock("./pipeline/run-executive-posts", () => ({
  runExecutivePostsPipeline: vi.fn(),
}));

import { runExecutivePostsPipeline } from "./pipeline/run-executive-posts";
import { runFeedWithMemberVotes } from "./pipeline/run-feed-with-member-votes";
import handler from "./worker";

function createMockDb(): D1Database {
  const runResult = { success: true, meta: { duration: 0 } };
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
      chamberWarnings: [],
      lifecycleRefreshed: 0,
      lifecycleSkipped: 0,
      lifecycleWarnings: [],
      memberVotes: {
        rollsProcessed: 1,
        rollsSkipped: 0,
        rollsAttempted: 1,
        rollsRemaining: 0,
        membersUpserted: 2,
        votesUpserted: 400,
      },
    });

    const { ctx, awaitScheduled } = createScheduledContext();
    handler.scheduled(
      { cron: "0 10 * * *", scheduledTime: 1_234 } as ScheduledController,
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
      { cron: "0 10 * * *", scheduledTime: 1_234 } as ScheduledController,
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
      { cron: "0 * * * *", scheduledTime: 1_234 } as ScheduledController,
      createMockEnv() as any,
      ctx,
    );
    await awaitScheduled();

    expect(runExecutivePostsPipeline).toHaveBeenCalled();
    expect(runFeedWithMemberVotes).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('"event":"executive_posts_pipeline_complete"'),
    );
    log.mockRestore();
  });
});
