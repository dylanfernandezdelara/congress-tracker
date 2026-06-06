import { describe, expect, it } from "vitest";

import handler from "./worker";

function createMockEnv() {
  return {
    CONGRESS: "119",
    SESSION: "2",
    TARGET_STATE: "ALL",
    SENATE_DB: {} as D1Database,
  };
}

describe("worker shell", () => {
  it("returns health", async () => {
    const response = await handler.fetch(
      new Request("http://127.0.0.1:8787/health"),
      createMockEnv() as any
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: "ok", congress: "119", session: "2" });
  });

  it("returns not_implemented for briefing feed", async () => {
    const response = await handler.fetch(
      new Request("http://127.0.0.1:8787/briefings/latest.json"),
      createMockEnv() as any
    );
    const body = await response.json() as { error: string };
    expect(response.status).toBe(503);
    expect(body.error).toBe("not_implemented");
  });
});
