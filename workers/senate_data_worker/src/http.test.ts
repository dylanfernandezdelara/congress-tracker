import { describe, expect, it, vi } from "vitest";
import { handlePublicFetch } from "./http/router";

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

function createMockEnv(overrides: Record<string, unknown> = {}) {
  return {
    DB: createMockDb(),
    CONGRESS: "119",
    SESSION: "2",
    CONGRESS_API_KEY: "test-key",
    OPENROUTER_API_KEY: "test-or",
    ALLOWED_ORIGIN: "*",
    DEV_OPEN_PIPELINE: "1",
    ...overrides,
  };
}

function pipelineRequest(path: string, init?: RequestInit): Request {
  return new Request(`https://worker.example.com${path}`, {
    method: "POST",
    ...init,
  });
}

describe("HTTP API", () => {
  it("returns health", async () => {
    const response = await handlePublicFetch(
      new Request("https://worker.example.com/health"),
      createMockEnv() as any
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ status: "ok", congress: "119" });
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

  it("returns session stats", async () => {
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

  it("requires chamber for defectors", async () => {
    const response = await handlePublicFetch(
      new Request("https://worker.example.com/stats/defectors.json"),
      createMockEnv() as any
    );
    expect(response.status).toBe(400);
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

  it("returns empty game rounds", async () => {
    const response = await handlePublicFetch(
      new Request("https://worker.example.com/game/rounds.json"),
      createMockEnv() as any
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ rounds: [], total: 0, limit: 20 });
  });

  it("requires id for game reveal", async () => {
    const response = await handlePublicFetch(
      new Request("https://worker.example.com/game/reveal.json"),
      createMockEnv() as any
    );
    expect(response.status).toBe(400);
  });

  it("returns 404 for unknown game reveal id", async () => {
    const response = await handlePublicFetch(
      new Request("https://worker.example.com/game/reveal.json?id=House:119:2:999"),
      createMockEnv() as any
    );
    expect(response.status).toBe(404);
  });

  it("rejects write pipelines in production when no admin token is set", async () => {
    const response = await handlePublicFetch(
      pipelineRequest("/__pipeline/run/member-votes"),
      createMockEnv({ ALLOWED_ORIGIN: "https://congress.example", DEV_OPEN_PIPELINE: undefined }) as any
    );
    expect(response.status).toBe(401);
  });

  it("allows write pipelines in local dev mode (DEV_OPEN_PIPELINE=1)", async () => {
    const response = await handlePublicFetch(
      pipelineRequest("/__pipeline/run/member-votes"),
      createMockEnv() as any
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, rollsRemaining: 0 });
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
