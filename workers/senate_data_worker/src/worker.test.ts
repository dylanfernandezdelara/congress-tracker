import { describe, expect, it, vi } from "vitest";
import handler from "./worker";

function createMockDb(): D1Database {
  return {
    exec: vi.fn(async () => {}),
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        all: vi.fn(async () => ({ results: [] })),
        first: vi.fn(async () => null),
        run: vi.fn(async () => ({})),
      })),
    })),
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

describe("worker", () => {
  it("returns health", async () => {
    const response = await handler.fetch(
      new Request("http://127.0.0.1:8787/health"),
      createMockEnv() as any
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: "ok", congress: "119", session: "2" });
  });

  it("serves feed endpoint", async () => {
    const response = await handler.fetch(
      new Request("http://127.0.0.1:8787/feed/latest.json"),
      createMockEnv() as any
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });
});
