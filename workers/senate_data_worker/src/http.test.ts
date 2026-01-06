/**
 * HTTP Read API Tests
 *
 * Tests the HTTP handler (fetch) in index.ts for:
 * - /health endpoint
 * - /state/{STATE}/latest.json
 * - /state/{STATE}/_meta.json
 * - /state/{STATE}/{YYYY-MM-DD}.json
 * - CORS headers
 * - Cache-Control headers
 * - OPTIONS preflight
 * - 404 responses
 * - 405 method not allowed
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SnapshotJson, MetaJson } from "./types";

// ============================================================================
// Mock Data
// ============================================================================

const mockSnapshot: SnapshotJson = {
  state: "NY",
  vote_date: "2025-12-18",
  generated_at: "2026-01-04T16:30:00.000Z",
  congress: 119,
  session: 1,
  votes: [
    {
      vote_number: 312,
      title: "On the Motion to Table S.Amdt. 3456",
      question: "On the Motion to Table",
      result: "Motion to Table Agreed to",
      issue: "H.R. 8998",
      counts: { yeas: 52, nays: 48, present: 0, absent: 0 },
      members: [
        { name: "Gillibrand (D-NY)", state: "NY", party: "D", vote_cast: "Yea" },
        { name: "Schumer (D-NY)", state: "NY", party: "D", vote_cast: "Yea" },
      ],
    },
  ],
};

const mockMeta: MetaJson = {
  state: "NY",
  congress: 119,
  session: 1,
  generated_at: "2026-01-04T16:30:00.000Z",
  cutoff_date_et: "2026-01-04",
  target_vote_date: "2025-12-18",
  keys: {
    latest: "state/NY/latest.json",
    snapshot: "state/NY/2025-12-18.json",
  },
  stats: {
    votes_total: 8,
    votes_with_state_members: 8,
    state_member_votes: 16,
  },
  partial: false,
  missing_votes: [],
};

// ============================================================================
// Mock R2 Bucket
// ============================================================================

function createMockBucket(data: Record<string, unknown>) {
  return {
    get: vi.fn(async (key: string) => {
      const value = data[key];
      if (value === undefined) return null;
      return { text: async () => JSON.stringify(value) };
    }),
    put: vi.fn(),
  } as unknown as R2Bucket;
}

// ============================================================================
// Import and setup handler
// ============================================================================

// We need to test the handleFetch function, but it's not exported
// So we'll re-import the default export and extract the fetch handler
import handler from "./index";

const mockEnv = {
  DATA_BUCKET: createMockBucket({
    "state/NY/latest.json": mockSnapshot,
    "state/NY/_meta.json": mockMeta,
    "state/NY/2025-12-18.json": mockSnapshot,
  }),
  CONGRESS: "119",
  SESSION: "1",
  TARGET_STATE: "NY",
};

// Helper to create mock requests
function mockRequest(
  path: string,
  method: string = "GET"
): Request {
  return new Request(`https://worker.example.com${path}`, { method });
}

// ============================================================================
// Tests
// ============================================================================

describe("HTTP Read API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("OPTIONS preflight", () => {
    it("returns 204 with CORS headers", async () => {
      const req = mockRequest("/state/NY/latest.json", "OPTIONS");
      const res = await handler.fetch(req, mockEnv as any);

      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(res.headers.get("Access-Control-Allow-Methods")).toBe(
        "GET, OPTIONS"
      );
      expect(res.headers.get("Access-Control-Allow-Headers")).toBe(
        "Content-Type"
      );
    });

    it("returns 204 for OPTIONS on any path", async () => {
      const req = mockRequest("/any/path/here", "OPTIONS");
      const res = await handler.fetch(req, mockEnv as any);

      expect(res.status).toBe(204);
    });
  });

  describe("Method not allowed", () => {
    it("returns 405 for POST requests", async () => {
      const req = mockRequest("/state/NY/latest.json", "POST");
      const res = await handler.fetch(req, mockEnv as any);

      expect(res.status).toBe(405);
      const body = await res.json();
      expect(body).toEqual({
        error: "method_not_allowed",
        message: "Only GET requests are allowed",
      });
    });

    it("returns 405 for PUT requests", async () => {
      const req = mockRequest("/state/NY/latest.json", "PUT");
      const res = await handler.fetch(req, mockEnv as any);

      expect(res.status).toBe(405);
    });

    it("returns 405 for DELETE requests", async () => {
      const req = mockRequest("/state/NY/latest.json", "DELETE");
      const res = await handler.fetch(req, mockEnv as any);

      expect(res.status).toBe(405);
    });
  });

  describe("GET /health", () => {
    it("returns 200 with status ok", async () => {
      const req = mockRequest("/health");
      const res = await handler.fetch(req, mockEnv as any);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("ok");
      expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("includes correct Cache-Control header", async () => {
      const req = mockRequest("/health");
      const res = await handler.fetch(req, mockEnv as any);

      expect(res.headers.get("Cache-Control")).toBe(
        "s-maxage=60, max-age=0, must-revalidate"
      );
    });

    it("includes CORS headers", async () => {
      const req = mockRequest("/health");
      const res = await handler.fetch(req, mockEnv as any);

      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });

    it("includes Content-Type header", async () => {
      const req = mockRequest("/health");
      const res = await handler.fetch(req, mockEnv as any);

      expect(res.headers.get("Content-Type")).toBe("application/json");
    });
  });

  describe("GET /state/{STATE}/latest.json", () => {
    it("returns snapshot data with 200", async () => {
      const req = mockRequest("/state/NY/latest.json");
      const res = await handler.fetch(req, mockEnv as any);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(mockSnapshot);
    });

    it("includes short TTL Cache-Control", async () => {
      const req = mockRequest("/state/NY/latest.json");
      const res = await handler.fetch(req, mockEnv as any);

      expect(res.headers.get("Cache-Control")).toBe(
        "s-maxage=300, stale-while-revalidate=86400"
      );
    });

    it("includes CORS headers", async () => {
      const req = mockRequest("/state/NY/latest.json");
      const res = await handler.fetch(req, mockEnv as any);

      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });

    it("returns 404 for missing state", async () => {
      const req = mockRequest("/state/TX/latest.json");
      const res = await handler.fetch(req, mockEnv as any);

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toEqual({
        error: "not_found",
        message: "Resource not found",
        path: "/state/TX/latest.json",
      });
    });

    it("only matches uppercase two-letter state codes", async () => {
      const req = mockRequest("/state/ny/latest.json");
      const res = await handler.fetch(req, mockEnv as any);

      // Should be 404 because the route regex expects uppercase
      expect(res.status).toBe(404);
    });
  });

  describe("GET /state/{STATE}/_meta.json", () => {
    it("returns meta data with 200", async () => {
      const req = mockRequest("/state/NY/_meta.json");
      const res = await handler.fetch(req, mockEnv as any);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(mockMeta);
    });

    it("includes short TTL Cache-Control (same as latest)", async () => {
      const req = mockRequest("/state/NY/_meta.json");
      const res = await handler.fetch(req, mockEnv as any);

      expect(res.headers.get("Cache-Control")).toBe(
        "s-maxage=300, stale-while-revalidate=86400"
      );
    });

    it("returns 404 for missing state", async () => {
      const req = mockRequest("/state/CA/_meta.json");
      const res = await handler.fetch(req, mockEnv as any);

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("not_found");
      expect(body.path).toBe("/state/CA/_meta.json");
    });
  });

  describe("GET /state/{STATE}/{YYYY-MM-DD}.json", () => {
    it("returns snapshot data with 200", async () => {
      const req = mockRequest("/state/NY/2025-12-18.json");
      const res = await handler.fetch(req, mockEnv as any);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(mockSnapshot);
    });

    it("includes longer TTL Cache-Control for snapshots", async () => {
      const req = mockRequest("/state/NY/2025-12-18.json");
      const res = await handler.fetch(req, mockEnv as any);

      expect(res.headers.get("Cache-Control")).toBe(
        "s-maxage=86400, stale-while-revalidate=604800"
      );
    });

    it("does NOT include immutable in Cache-Control", async () => {
      const req = mockRequest("/state/NY/2025-12-18.json");
      const res = await handler.fetch(req, mockEnv as any);

      const cacheControl = res.headers.get("Cache-Control") ?? "";
      expect(cacheControl).not.toContain("immutable");
    });

    it("returns 404 for missing date", async () => {
      const req = mockRequest("/state/NY/2025-01-01.json");
      const res = await handler.fetch(req, mockEnv as any);

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body).toEqual({
        error: "not_found",
        message: "Resource not found",
        path: "/state/NY/2025-01-01.json",
      });
    });

    it("only matches valid date format", async () => {
      // Invalid date format should 404 (route won't match)
      const req = mockRequest("/state/NY/12-18-2025.json");
      const res = await handler.fetch(req, mockEnv as any);

      expect(res.status).toBe(404);
    });
  });

  describe("404 for unknown routes", () => {
    it("returns 404 for root path", async () => {
      const req = mockRequest("/");
      const res = await handler.fetch(req, mockEnv as any);

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("not_found");
      expect(body.path).toBe("/");
    });

    it("returns 404 for unknown paths", async () => {
      const req = mockRequest("/api/votes");
      const res = await handler.fetch(req, mockEnv as any);

      expect(res.status).toBe(404);
    });

    it("returns 404 for partial state paths", async () => {
      const req = mockRequest("/state/NY");
      const res = await handler.fetch(req, mockEnv as any);

      expect(res.status).toBe(404);
    });

    it("404 response includes CORS headers", async () => {
      const req = mockRequest("/unknown/path");
      const res = await handler.fetch(req, mockEnv as any);

      expect(res.status).toBe(404);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });

    it("404 response includes Content-Type header", async () => {
      const req = mockRequest("/unknown/path");
      const res = await handler.fetch(req, mockEnv as any);

      expect(res.headers.get("Content-Type")).toBe("application/json");
    });
  });
});

