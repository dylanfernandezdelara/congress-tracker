import { beforeEach, describe, expect, it, vi } from "vitest";

import handler from "./worker";
import * as pipelineJobs from "./pipeline/jobs";
import * as pipelineMaterialize from "./pipeline/materialize";
import * as scheduledIngestion from "./pipeline/scheduled-ingestion";
import * as documents from "./d1/documents";
import { resetSchemaOnceForTests } from "./storage";

function createSequentialOnlyDb(): D1Database {
  let activeQueries = 0;

  const runQuery = async <T>(value: T): Promise<T> => {
    if (activeQueries > 0) {
      throw new Error("Concurrent D1 query detected");
    }

    activeQueries += 1;
    await Promise.resolve();
    activeQueries -= 1;
    return value;
  };

  return {
    async batch(statements: D1PreparedStatement[]) {
      for (const statement of statements) {
        await statement.run();
      }
      return statements.map(() => ({ success: true, meta: { duration: 0 } }));
    },
    prepare(sql: string) {
      const normalizedSql = sql.replace(/\s+/g, " ").trim();

      return {
        bind() {
          return this;
        },
        async run() {
          return { success: true, meta: { duration: 0 } };
        },
        async first<T>() {
          if (normalizedSql.includes("FROM votes")) {
            return runQuery({
              total_votes: 3466,
              earliest_vote_date: "2015-01-08",
              latest_vote_date: "2026-03-09",
            } as T);
          }

          throw new Error(`Unexpected first() query: ${normalizedSql}`);
        },
        async all<T>() {
          if (normalizedSql.startsWith("PRAGMA table_info")) {
            return runQuery({
              results: [{ name: "issue_key" }],
              success: true,
              meta: { duration: 0 },
            } as T);
          }
          if (normalizedSql.includes("FROM pipeline_checkpoints")) {
            return runQuery({
              results: [
                {
                  checkpoint_key: "historical_backfill:118:all",
                  cursor_json: "{\"session_index\":2,\"offset\":0}",
                  updated_at: "2026-03-09T04:53:38.800Z",
                },
              ],
              success: true,
              meta: { duration: 1 },
            } as T);
          }

          throw new Error(`Unexpected all() query: ${normalizedSql}`);
        },
      } as unknown as D1PreparedStatement;
    },
  } as unknown as D1Database;
}

function createMockEnv(overrides: Record<string, unknown> = {}) {
  return {
    CONGRESS: "119",
    SESSION: "2",
    TARGET_STATE: "ALL",
    CONGRESS_API_KEY: "test-congress-key",
    GOVINFO_API_KEY: "test-govinfo-key",
    SENATE_DB: createSequentialOnlyDb(),
    ...overrides,
  };
}

describe("pipeline debug routes", () => {
  beforeEach(() => {
    resetSchemaOnceForTests();
  });

  it("returns pipeline status without overlapping local D1 reads", async () => {
    const request = new Request("http://127.0.0.1:8787/__pipeline/status");
    const response = await handler.fetch(request, createMockEnv() as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: "ok",
      queue_enabled: false,
      d1_enabled: true,
      votes: {
        total_votes: 3466,
        earliest_vote_date: "2015-01-08",
        latest_vote_date: "2026-03-09",
      },
      checkpoints: [
        {
          checkpoint_key: "historical_backfill:118:all",
          cursor_json: "{\"session_index\":2,\"offset\":0}",
          updated_at: "2026-03-09T04:53:38.800Z",
        },
      ],
    });
  });

  it("requires an admin token for non-local pipeline status", async () => {
    const request = new Request("https://worker.example.com/__pipeline/status");
    const response = await handler.fetch(request, createMockEnv() as any);
    const body = await response.json() as { error: string };

    expect(response.status).toBe(503);
    expect(body.error).toBe("pipeline_admin_token_required");
  });

  it("returns pipeline status for non-local callers with a valid admin token", async () => {
    const request = new Request("https://worker.example.com/__pipeline/status", {
      headers: { Authorization: "Bearer correct-token" },
    });
    const response = await handler.fetch(
      request,
      createMockEnv({ PIPELINE_ADMIN_TOKEN: "correct-token" }) as any
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: "ok", d1_enabled: true });
  });

  it("accepts POST for non-local manual run routes with a valid admin token", async () => {
    const runSpy = vi.spyOn(scheduledIngestion, "runScheduledIngestion").mockResolvedValue();
    const request = new Request("https://worker.example.com/__pipeline/run/ingestion", {
      method: "POST",
      headers: { Authorization: "Bearer correct-token" },
    });
    const response = await handler.fetch(
      request,
      createMockEnv({ PIPELINE_ADMIN_TOKEN: "correct-token" }) as any
    );
    const body = await response.json() as { status: string; action: string };

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: "ok", action: "scheduled_ingestion" });
    expect(runSpy).toHaveBeenCalledOnce();
    runSpy.mockRestore();
  });

  it("requires an admin token for non-local manual run routes", async () => {
    const request = new Request("https://worker.example.com/__pipeline/run/ingestion");
    const response = await handler.fetch(request, createMockEnv() as any);
    const body = await response.json() as { error: string };

    expect(response.status).toBe(503);
    expect(body.error).toBe("pipeline_admin_token_required");
  });

  it("rejects invalid admin tokens for manual run routes", async () => {
    const request = new Request("https://worker.example.com/__pipeline/run/ingestion", {
      headers: { Authorization: "Bearer wrong-token" },
    });
    const response = await handler.fetch(
      request,
      createMockEnv({ PIPELINE_ADMIN_TOKEN: "correct-token" }) as any
    );
    const body = await response.json() as { error: string };

    expect(response.status).toBe(401);
    expect(body.error).toBe("unauthorized");
  });

  it("allows valid admin tokens before validating manual route input", async () => {
    const request = new Request(
      "https://worker.example.com/__pipeline/run/historical-backfill?congress=0",
      {
        headers: { Authorization: "Bearer correct-token" },
      }
    );
    const response = await handler.fetch(
      request,
      createMockEnv({ PIPELINE_ADMIN_TOKEN: "correct-token" }) as any
    );
    const body = await response.json() as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_backfill_target");
  });

  it("allows local manual run routes without an admin token", async () => {
    const request = new Request("http://127.0.0.1:8787/__pipeline/run/historical-backfill?congress=0");
    const response = await handler.fetch(request, createMockEnv() as any);
    const body = await response.json() as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_backfill_target");
  });

  it("runs scheduled ingestion on local /__pipeline/run/ingestion", async () => {
    const runSpy = vi.spyOn(scheduledIngestion, "runScheduledIngestion").mockResolvedValue();
    const request = new Request("http://127.0.0.1:8787/__pipeline/run/ingestion");
    const response = await handler.fetch(request, createMockEnv() as any);
    const body = await response.json() as { status: string; action: string };

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: "ok", action: "scheduled_ingestion" });
    expect(runSpy).toHaveBeenCalledOnce();
    runSpy.mockRestore();
  });

  it("returns 503 for materialize when ledger or overview is missing", async () => {
    vi.spyOn(documents, "readDocumentJson").mockResolvedValue(null);
    const request = new Request("http://127.0.0.1:8787/__pipeline/run/materialize");
    const response = await handler.fetch(request, createMockEnv() as any);
    const body = await response.json() as { error: string };

    expect(response.status).toBe(503);
    expect(body.error).toBe("missing_prerequisites");
  });

  it("dispatches historical backfill jobs through the pipeline processor", async () => {
    const jobSpy = vi.spyOn(pipelineJobs, "processPipelineJob").mockResolvedValue();
    const request = new Request("http://127.0.0.1:8787/__pipeline/run/historical-backfill?congress=119");
    const response = await handler.fetch(request, createMockEnv() as any);
    const body = await response.json() as { status: string; action: string };

    expect(response.status).toBe(200);
    expect(body.action).toBe("historical_backfill");
    expect(jobSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "historical_backfill", congress: 119 }),
      expect.anything(),
      expect.anything()
    );
    jobSpy.mockRestore();
  });

  it("defers scheduled ingestion work through ctx.waitUntil", async () => {
    const runSpy = vi.spyOn(scheduledIngestion, "runScheduledIngestion").mockResolvedValue();
    const waitUntil = vi.fn();
    const ctx = { waitUntil } as unknown as ExecutionContext;
    await handler.scheduled(
      { scheduledTime: Date.now() } as ScheduledController,
      createMockEnv() as any,
      ctx
    );
    runSpy.mockRestore();
    expect(waitUntil).toHaveBeenCalledOnce();
    expect(waitUntil.mock.calls[0]?.[0]).toBeInstanceOf(Promise);
  });

  it("acks queue messages after successful job dispatch", async () => {
    const materializeSpy = vi.spyOn(pipelineMaterialize, "materializeReadModels").mockResolvedValue();
    const ledger = {
      congress: 119,
      session: 2,
      generated_at: "2026-01-20T12:00:00Z",
      total_votes: 0,
      entries: [],
    };
    const overview = {
      congress: 119,
      session: 2,
      generated_at: "2026-01-20T12:00:00Z",
      total_votes: 0,
      latest_vote_date: "2026-01-17",
      total_defections: 0,
      senators: [],
    };
    vi.spyOn(documents, "readDocumentJson").mockImplementation(async (_db, key) => {
      if (key === "votes/ledger.json") return ledger;
      if (key === "stats/overview.json") return overview;
      return null;
    });

    const ack = vi.fn();
    const retry = vi.fn();
    const waitUntil = vi.fn((promise: Promise<unknown>) => promise);
    const ctx = { waitUntil } as unknown as ExecutionContext;
    const job = {
      type: "materialize_read_models",
      created_at: new Date().toISOString(),
      reason: "test",
    } as const;
    await handler.queue(
      {
        messages: [{ body: job, ack, retry }],
      } as unknown as MessageBatch<typeof job>,
      createMockEnv() as any,
      ctx
    );
    await waitUntil.mock.calls[0]?.[0];
    expect(materializeSpy).toHaveBeenCalledOnce();
    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
    materializeSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("materializes read models on local /__pipeline/run/materialize when prerequisites exist", async () => {
    const materializeSpy = vi.spyOn(pipelineMaterialize, "materializeReadModels").mockResolvedValue();
    const ledger = {
      congress: 119,
      session: 2,
      generated_at: "2026-01-20T12:00:00Z",
      total_votes: 0,
      entries: [],
    };
    const overview = {
      congress: 119,
      session: 2,
      generated_at: "2026-01-20T12:00:00Z",
      total_votes: 0,
      latest_vote_date: "2026-01-17",
      total_defections: 0,
      senators: [],
    };
    vi.spyOn(documents, "readDocumentJson").mockImplementation(async (_db, key) => {
      if (key === "votes/ledger.json") return ledger;
      if (key === "stats/overview.json") return overview;
      return null;
    });

    const request = new Request("http://127.0.0.1:8787/__pipeline/run/materialize");
    const response = await handler.fetch(request, createMockEnv() as any);
    expect(response.status).toBe(200);
    expect(materializeSpy).toHaveBeenCalledOnce();
    materializeSpy.mockRestore();
    vi.restoreAllMocks();
  });
});
