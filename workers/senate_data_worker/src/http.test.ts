/**
 * HTTP Read API Tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BriefingFeedResponse, VoteDetailResponse } from "./platform-types";
import * as materialization from "./d1/materialization";
import { handlePublicFetch } from "./http/router";

const handler = { fetch: handlePublicFetch };

const mockBriefing: BriefingFeedResponse = {
  generated_at: "2026-01-04T16:30:00.000Z",
  source: "d1",
  items: [
    {
      id: "119:1:312",
      congress: 119,
      session: 1,
      vote_number: 312,
      vote_date: "2025-12-18",
      title: "H.R. 8998",
      summary: "A briefing summary for testing.",
      outcome_label: "Passed the Senate hurdle",
      status: "passed",
      category: "Senate business",
      tally: { yea: 52, nay: 48, present: 0, absent: 0 },
      crossed_party_lines: [],
      source_coverage: {
        level: "partial",
        vote_data: true,
        bill_context: true,
        congressional_record: false,
        floor_logs: false,
        model_summary: false,
      },
      detail_path: "/votes/119/1/312",
      plain_action: "The Senate agreed to H.R. 8998.",
      public_impact_summary: "A briefing summary for testing.",
      content_confidence: "medium",
      source_basis: ["vote_question"],
    },
  ],
};

const mockVoteDetail: VoteDetailResponse = {
  generated_at: "2026-01-04T16:30:00.000Z",
  source: "d1",
  vote_content_profile: {
    vote_id: "119:1:312",
    congress: 119,
    session: 1,
    vote_number: 312,
    vote_date: "2025-12-18",
    target_type: "bill",
    stage: "other",
    plain_action: "The Senate agreed to H.R. 8998.",
    official_summary: null,
    public_impact_summary: "Test profile for HTTP mock.",
    policy_topics: [],
    affected_groups: [],
    content_confidence: "medium",
    source_basis: ["vote_question"],
  },
  vote: {
    id: "119:1:312",
    congress: 119,
    session: 1,
    vote_number: 312,
    vote_date: "2025-12-18",
    title: "H.R. 8998",
    question: "On the Motion to Table",
    result: "Motion to Table Agreed to",
    issue: "H.R. 8998",
    tally: { yea: 52, nay: 48, present: 0, absent: 0 },
    status: "passed",
  },
  procedural_context: {
    step_type: "vote",
    question: "On the Motion to Table",
  },
  party_breakdown: [],
  crossovers: [],
  history: {
    thread_key: "H.R. 8998",
    measure_recurrence_count: 1,
    issue_key: "topic-test",
    issue_title: "H.R. 8998",
    issue_recurrence_count: 1,
    first_seen_vote_date: "2025-12-18",
    related_votes: [],
  },
  arguments: {
    available: false,
    coverage_note: "No excerpts",
    parties: [],
    excerpts: [],
  },
  source_coverage: {
    level: "partial",
    vote_data: true,
    bill_context: true,
    congressional_record: false,
    floor_logs: false,
    model_summary: false,
  },
};

function createSenateDb(options: { briefingGeneratedAt?: string } = {}) {
  return {
    prepare(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      const statement = {
        bind() {
          return statement;
        },
        async all<T>() {
          if (normalized.includes("FROM daily_briefings")) {
            return {
              results: options.briefingGeneratedAt
                ? [{ generated_at: options.briefingGeneratedAt }]
                : [],
              success: true,
              meta: { duration: 0 },
            } as T;
          }
          return { results: [], success: true, meta: { duration: 0 } } as T;
        },
      };
      return statement as unknown as D1PreparedStatement;
    },
  } as unknown as D1Database;
}

function createMockEnv(overrides: Record<string, unknown> = {}) {
  return {
    SENATE_DB: createSenateDb({ briefingGeneratedAt: new Date().toISOString() }),
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
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(materialization, "readLatestBriefingFromD1").mockResolvedValue(mockBriefing);
    vi.spyOn(materialization, "readVoteDetailFromD1").mockResolvedValue(mockVoteDetail);
  });

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
    it("returns 200 when briefing freshness is within threshold", async () => {
      const res = await handler.fetch(mockRequest("/health/data"), createMockEnv() as any);
      expect(res.status).toBe(200);
      const body = await readJson<{ status: string }>(res);
      expect(body.status).toBe("ok");
    });

    it("returns 503 when no materialized briefing exists", async () => {
      const env = createMockEnv({ SENATE_DB: createSenateDb() });
      const res = await handler.fetch(mockRequest("/health/data"), env as any);
      expect(res.status).toBe(503);
      const body = await readJson<{ status: string }>(res);
      expect(body.status).toBe("stale");
    });
  });

  describe("GET /briefings/latest.json", () => {
    it("returns the materialized briefing payload", async () => {
      const res = await handler.fetch(mockRequest("/briefings/latest.json"), createMockEnv() as any);
      expect(res.status).toBe(200);
      const body = await readJson<BriefingFeedResponse>(res);
      expect(body.items[0]?.vote_number).toBe(312);
    });

    it("returns 404 when briefing is missing", async () => {
      vi.spyOn(materialization, "readLatestBriefingFromD1").mockResolvedValue(null);
      const res = await handler.fetch(mockRequest("/briefings/latest.json"), createMockEnv() as any);
      expect(res.status).toBe(404);
    });
  });

  describe("GET /votes/:congress/:session/:voteNumber.json", () => {
    it("returns the materialized vote detail payload", async () => {
      const res = await handler.fetch(mockRequest("/votes/119/1/312.json"), createMockEnv() as any);
      expect(res.status).toBe(200);
      const body = await readJson<VoteDetailResponse>(res);
      expect(body.vote.vote_number).toBe(312);
    });

    it("returns 404 when vote detail is missing", async () => {
      vi.spyOn(materialization, "readVoteDetailFromD1").mockResolvedValue(null);
      const res = await handler.fetch(mockRequest("/votes/119/1/999.json"), createMockEnv() as any);
      expect(res.status).toBe(404);
    });
  });

  describe("404 for unknown routes", () => {
    it("returns 404 for unsupported paths", async () => {
      const res = await handler.fetch(mockRequest("/state/NY/latest.json"), createMockEnv() as any);
      expect(res.status).toBe(404);
    });
  });
});
