import { describe, expect, it } from "vitest";

import { handlePublicFetch } from "./http/router";

function createMockEnv(overrides: Record<string, unknown> = {}) {
  return {
    SENATE_DB: {} as D1Database,
    CONGRESS: "119",
    SESSION: "1",
    TARGET_STATE: "NY",
    ...overrides,
  };
}

describe("HTTP read API shell", () => {
  it("returns health", async () => {
    const response = await handlePublicFetch(
      new Request("https://worker.example.com/health"),
      createMockEnv() as any
    );
    expect(response.status).toBe(200);
  });

  it("returns not_implemented for data routes", async () => {
    for (const path of ["/health/data", "/briefings/latest.json", "/votes/119/1/1.json"]) {
      const response = await handlePublicFetch(
        new Request(`https://worker.example.com${path}`),
        createMockEnv() as any
      );
      expect(response.status).toBe(503);
    }
  });
});
