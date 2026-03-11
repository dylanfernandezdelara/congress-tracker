import { describe, expect, it, vi } from "vitest";

import handler from "./pipeline-index";

function createMockBucket() {
  return {
    get: vi.fn(),
    put: vi.fn(),
  } as unknown as R2Bucket;
}

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
    prepare(sql: string) {
      const normalizedSql = sql.replace(/\s+/g, " ").trim();

      return {
        async first<T>() {
          if (normalizedSql.includes("FROM votes")) {
            return runQuery({
              total_votes: 3466,
              earliest_vote_date: "2015-01-08",
              latest_vote_date: "2026-03-09",
            } as T);
          }

          if (normalizedSql.includes("FROM argument_excerpts")) {
            return runQuery({
              excerpt_count: 11,
              votes_with_excerpts: 4,
            } as T);
          }

          throw new Error(`Unexpected first() query: ${normalizedSql}`);
        },
        async all<T>() {
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
    DATA_BUCKET: createMockBucket(),
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
  it("returns pipeline status without overlapping local D1 reads", async () => {
    const request = new Request("https://worker.example.com/__pipeline/status");
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
      excerpts: {
        excerpt_count: 11,
        votes_with_excerpts: 4,
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
});
