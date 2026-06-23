import { describe, expect, it, vi, beforeEach } from "vitest";
import { resetSchemaFlag } from "./schema";
import {
  getFeedPipelineRun,
  getLatestPassageVoteDate,
  recordFeedPipelineRun,
} from "./pipeline-state";
import type { Env } from "../config";

function createEnv(): Env {
  return {
    CONGRESS: "119",
    SESSION: "2",
    DB: {} as D1Database,
    CONGRESS_API_KEY: "test",
    OPENROUTER_API_KEY: "test",
  };
}

function createMockDb(): D1Database {
  const store = new Map<string, string>();
  const runResult = { success: true, meta: { duration: 0 } };

  const stmt = (sql: string) => {
    const state = {
      sql,
      args: [] as unknown[],
      bind(...args: unknown[]) {
        state.args = args;
        return state;
      },
      async run() {
        if (sql.includes("INSERT INTO pipeline_state")) {
          store.set(String(state.args[0]), String(state.args[1]));
        }
        return runResult;
      },
      async first<T>() {
        if (sql.includes("FROM pipeline_state")) {
          const value = store.get(String(state.args[0]));
          return value ? ({ value_json: value } as T) : null;
        }
        if (sql.includes("MAX(vote_date)")) {
          expect(state.args[0]).toBe(119);
          return { latest_passage_vote_date: "2026-06-11" } as T;
        }
        return null;
      },
    };
    return state;
  };

  return {
    exec: vi.fn(async () => {}),
    prepare: vi.fn((sql: string) => stmt(sql)),
  } as unknown as D1Database;
}

describe("pipeline-state", () => {
  beforeEach(() => {
    resetSchemaFlag();
  });

  it("records and reads the last feed pipeline run", async () => {
    const db = createMockDb();
    await recordFeedPipelineRun(db, "admin", {
      votesUpserted: 2,
      votesSkipped: 5,
      billsSelected: 10,
      digestsWritten: 1,
      digestsSkipped: 9,
    });

    const lastRun = await getFeedPipelineRun(db);
    expect(lastRun).toMatchObject({
      trigger: "admin",
      votesUpserted: 2,
      votesSkipped: 5,
    });
    expect(lastRun?.completed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("returns latest passage vote date for the configured congress", async () => {
    const env = createEnv();
    env.DB = createMockDb();
    await expect(getLatestPassageVoteDate(env)).resolves.toBe("2026-06-11");
  });
});
