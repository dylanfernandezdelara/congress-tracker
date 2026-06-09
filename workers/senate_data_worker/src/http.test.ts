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
    ...overrides,
  };
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

  it("returns empty feed array", async () => {
    const response = await handlePublicFetch(
      new Request("https://worker.example.com/feed/latest.json"),
      createMockEnv() as any
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual([]);
  });

  it("returns 404 for unknown routes", async () => {
    const response = await handlePublicFetch(
      new Request("https://worker.example.com/briefings/latest.json"),
      createMockEnv() as any
    );
    expect(response.status).toBe(404);
  });
});
