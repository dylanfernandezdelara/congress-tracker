import { describe, expect, it, vi } from "vitest";

import handler from "./worker";
import * as pipelineJobs from "./pipeline/jobs";
import * as pipelineMaterialize from "./pipeline/materialize";
import * as scheduledIngestion from "./pipeline/scheduled-ingestion";

function createMockEnv(overrides: Record<string, unknown> = {}) {
  return {
    CONGRESS: "119",
    SESSION: "2",
    TARGET_STATE: "ALL",
    CONGRESS_API_KEY: "test-congress-key",
    GOVINFO_API_KEY: "test-govinfo-key",
    SENATE_DB: {} as D1Database,
    ...overrides,
  };
}

describe("pipeline debug routes", () => {
  it("returns pipeline status without storage details", async () => {
    const request = new Request("http://127.0.0.1:8787/__pipeline/status");
    const response = await handler.fetch(request, createMockEnv() as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: "ok",
      queue_enabled: false,
      d1_enabled: true,
      storage_configured: false,
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
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      d1_enabled: true,
      storage_configured: false,
    });
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

  it("returns 503 for materialize when prerequisites are missing", async () => {
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
    const materializeSpy = vi
      .spyOn(pipelineMaterialize, "materializeReadModelsFromStorage")
      .mockResolvedValue();

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
});
