import { describe, expect, it, vi } from "vitest";

vi.mock("./pipeline/run-feed", () => ({
  runFeedPipeline: vi.fn(),
}));

import { runFeedPipeline } from "./pipeline/run-feed";
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
  it("returns health", async () => {
    const response = await handler.fetch(
      new Request("http://127.0.0.1:8787/health"),
      createMockEnv() as any
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "ok",
      congress: "119",
      session: "2",
      data: { daily_cron_utc: "0 10 * * *" },
    });
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
    vi.mocked(runFeedPipeline).mockResolvedValue({
      votesUpserted: 1,
      votesSkipped: 2,
      billsSelected: 3,
      digestsWritten: 1,
      digestsSkipped: 2,
    });

    const { ctx, awaitScheduled } = createScheduledContext();
    handler.scheduled(
      { cron: "0 10 * * *", scheduledTime: 1_234 } as ScheduledController,
      createMockEnv() as any,
      ctx,
    );
    await awaitScheduled();

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('"event":"feed_pipeline_complete"'),
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"votesUpserted":1'));
    log.mockRestore();
  });

  it("logs feed pipeline failures on scheduled", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(runFeedPipeline).mockRejectedValue(new Error("pipeline boom"));

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
});
