import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getFeedPipelineFailure,
  getFeedPipelineSuccess,
  recordFeedPipelineFailure,
  recordFeedPipelineSuccess,
} from "./pipeline-state";
import { resetSchemaFlag } from "./schema";

function createMockDb() {
  const store = new Map<string, { value_json: string; updated_at: string }>();
  const runResult = { success: true, meta: { duration: 0 } };

  const db = {
    prepare(sql: string) {
      const state = {
        bind: vi.fn((...args: unknown[]) => {
          state.args = args;
          return state;
        }),
        args: [] as unknown[],
        first: vi.fn(async () => {
          if (sql.includes("FROM pipeline_state")) {
            const key = state.args[0];
            const row = store.get(String(key));
            return row ? { value_json: row.value_json } : null;
          }
          return null;
        }),
        run: vi.fn(async () => {
          if (sql.includes("INSERT INTO pipeline_state")) {
            const [key, valueJson, updatedAt] = state.args;
            store.set(String(key), {
              value_json: String(valueJson),
              updated_at: String(updatedAt),
            });
          }
          return runResult;
        }),
      };
      return state;
    },
  } as unknown as D1Database;

  return { db, store };
}

describe("pipeline-state", () => {
  beforeEach(() => {
    resetSchemaFlag();
  });

  it("records and reads successful feed pipeline runs", async () => {
    const { db } = createMockDb();
    await recordFeedPipelineSuccess(db, "scheduled", {
      votesUpserted: 2,
      votesSkipped: 5,
      billsSelected: 7,
      digestsWritten: 3,
      digestsSkipped: 4,
    });

    const record = await getFeedPipelineSuccess(db);
    expect(record).toMatchObject({
      trigger: "scheduled",
      votesUpserted: 2,
      digestsWritten: 3,
    });
    expect(record?.completed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("records and reads feed pipeline failures", async () => {
    const { db } = createMockDb();
    await recordFeedPipelineFailure(db, "scheduled", "Congress.gov 503");

    const record = await getFeedPipelineFailure(db);
    expect(record).toMatchObject({
      trigger: "scheduled",
      error: "Congress.gov 503",
    });
    expect(record?.failed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
