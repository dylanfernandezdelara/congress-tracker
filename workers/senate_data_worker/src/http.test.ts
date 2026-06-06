/**
 * HTTP Read API Tests
 */

import { describe, expect, it } from "vitest";
import { handlePublicFetch } from "./http/router";

const handler = { fetch: handlePublicFetch };

function createMockEnv(overrides: Record<string, unknown> = {}) {
  return {
    SENATE_DB: {} as D1Database,
    CONGRESS: "119",
    SESSION: "1",
    TARGET_STATE: "NY",
    DATA_FRESHNESS_MAX_HOURS: "36",
    ...overrides,
  };
}

function mockRequest(path: string, method: string = "GET", headers?: HeadersInit): Request {
  return new Request(`https://worker.example.com${path}`, { method, headers });
}

async function readJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

describe("HTTP Read API", () => {
  describe("OPTIONS preflight", () => {
    it("returns 204 with CORS headers", async () => {
      const res = await handler.fetch(mockRequest("/briefings/latest.json", "OPTIONS"), createMockEnv() as any);
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });
  });

  describe("CORS origin restriction", () => {
    it("uses ALLOWED_ORIGIN and Vary header on GET responses", async () => {
      const env = createMockEnv({ ALLOWED_ORIGIN: "https://daily.example.com" });
      const res = await handler.fetch(mockRequest("/health"), env as any);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://daily.example.com");
      expect(res.headers.get("Vary")).toBe("Origin");
    });
  });

  describe("Method not allowed", () => {
    it("returns 405 for POST requests", async () => {
      const res = await handler.fetch(mockRequest("/briefings/latest.json", "POST"), createMockEnv() as any);
      expect(res.status).toBe(405);
    });
  });

  describe("GET /health", () => {
    it("returns 200 with status ok", async () => {
      const res = await handler.fetch(mockRequest("/health"), createMockEnv() as any);
      expect(res.status).toBe(200);
      const body = await readJson<{ status: string }>(res);
      expect(body.status).toBe("ok");
    });
  });

  describe("GET /health/data", () => {
    it("returns 503 while storage is not configured", async () => {
      const res = await handler.fetch(mockRequest("/health/data"), createMockEnv() as any);
      expect(res.status).toBe(503);
      const body = await readJson<{ status: string; message: string }>(res);
      expect(body.status).toBe("stale");
      expect(body.message).toContain("not been implemented");
    });
  });

  describe("GET /briefings/latest.json", () => {
    it("returns 503 while storage is not configured", async () => {
      const res = await handler.fetch(mockRequest("/briefings/latest.json"), createMockEnv() as any);
      expect(res.status).toBe(503);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("storage_not_configured");
    });
  });

  describe("GET /votes/:congress/:session/:voteNumber.json", () => {
    it("returns 503 while storage is not configured", async () => {
      const res = await handler.fetch(mockRequest("/votes/119/1/312.json"), createMockEnv() as any);
      expect(res.status).toBe(503);
      const body = await readJson<{ error: string }>(res);
      expect(body.error).toBe("storage_not_configured");
    });
  });

  describe("404 for unknown routes", () => {
    it("returns 404 for unsupported paths", async () => {
      const res = await handler.fetch(mockRequest("/state/NY/latest.json"), createMockEnv() as any);
      expect(res.status).toBe(404);
    });
  });
});
