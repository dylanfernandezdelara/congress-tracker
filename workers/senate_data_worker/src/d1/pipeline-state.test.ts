import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FeedPipelineTrigger } from "../../../../shared/ingest-api-types";
import type { Env } from "../config";
import {
  getExecutivePostsPipelineScheduledSuccess,
  getExecutivePostsPipelineSuccess,
  getFeedPipelineFailure,
  getFeedPipelineScheduledSuccess,
  getFeedPipelineSkipped,
  getFeedPipelineSuccess,
  getMissingDigestCount,
  recordExecutivePostsPipelineSuccess,
  recordFeedPipelineFailure,
  recordFeedPipelineSkipped,
  recordFeedPipelineSuccess,
} from "./pipeline-state";
import { resetSchemaFlag } from "./schema";

/** Dual-shape recorder for parameterized feed/executive two-key coverage. */
type DualShapeRecorder = (
  db: D1Database,
  trigger: FeedPipelineTrigger,
  result: Record<string, number>
) => Promise<void>;

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

const feedScheduledResult = {
  votesUpserted: 2,
  votesSkipped: 5,
  billsSelected: 7,
  digestsWritten: 3,
  digestsSkipped: 4,
};

const feedAdminResult = {
  votesUpserted: 1,
  votesSkipped: 0,
  billsSelected: 1,
  digestsWritten: 1,
  digestsSkipped: 0,
};

const executiveScheduledResult = {
  fetched: 4,
  ingested: 2,
  linked: 1,
  hydrated: 1,
  skipped: 0,
};

const executiveAdminResult = {
  fetched: 1,
  ingested: 1,
  linked: 0,
  hydrated: 0,
  skipped: 0,
};

describe("pipeline-state", () => {
  beforeEach(() => {
    resetSchemaFlag();
  });

  describe.each([
    {
      name: "feed",
      lastKey: "feed_pipeline_last_success",
      scheduledKey: "feed_pipeline_last_scheduled_success",
      recordSuccess: recordFeedPipelineSuccess as unknown as DualShapeRecorder,
      getSuccess: getFeedPipelineSuccess,
      getScheduledSuccess: getFeedPipelineScheduledSuccess,
      scheduledResult: feedScheduledResult,
      adminResult: feedAdminResult,
      scheduledMetric: { votesUpserted: 2 },
      adminMetric: { votesUpserted: 1 },
    },
    {
      name: "executive",
      lastKey: "executive_posts_pipeline_last_success",
      scheduledKey: "executive_posts_pipeline_last_scheduled_success",
      recordSuccess: recordExecutivePostsPipelineSuccess as unknown as DualShapeRecorder,
      getSuccess: getExecutivePostsPipelineSuccess,
      getScheduledSuccess: getExecutivePostsPipelineScheduledSuccess,
      scheduledResult: executiveScheduledResult,
      adminResult: executiveAdminResult,
      scheduledMetric: { fetched: 4 },
      adminMetric: { fetched: 1 },
    },
  ])(
    "$name two-key success recording",
    ({
      lastKey,
      scheduledKey,
      recordSuccess,
      getSuccess,
      getScheduledSuccess,
      scheduledResult,
      adminResult,
      scheduledMetric,
      adminMetric,
    }) => {
      it("records scheduled success in a dedicated key that admin runs do not overwrite", async () => {
        const { db, store } = createMockDb();
        await recordSuccess(db, "scheduled", scheduledResult);
        await recordSuccess(db, "admin", adminResult);

        const latest = await getSuccess(db);
        const scheduled = await getScheduledSuccess(db);
        expect(latest?.trigger).toBe("admin");
        expect(latest).toMatchObject(adminMetric);
        expect(scheduled?.trigger).toBe("scheduled");
        expect(scheduled).toMatchObject(scheduledMetric);
        expect(store.has(lastKey)).toBe(true);
        expect(store.has(scheduledKey)).toBe(true);
      });

      it("does not write scheduled success key for admin-only runs", async () => {
        const { db, store } = createMockDb();
        await recordSuccess(db, "admin", adminResult);

        expect(await getSuccess(db)).toMatchObject({ trigger: "admin" });
        expect(await getScheduledSuccess(db)).toBeNull();
        expect(store.has(scheduledKey)).toBe(false);
      });
    }
  );

  it("records and reads successful feed pipeline runs", async () => {
    const { db } = createMockDb();
    await recordFeedPipelineSuccess(db, "scheduled", feedScheduledResult);

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

  it("records and reads feed pipeline busy-skips", async () => {
    const { db } = createMockDb();
    await recordFeedPipelineSkipped(db, "scheduled", "pipeline_busy");

    const record = await getFeedPipelineSkipped(db);
    expect(record).toMatchObject({
      trigger: "scheduled",
      reason: "pipeline_busy",
    });
    expect(record?.skipped_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("counts null and unparseable digests as missing (matches parseStoredDigest)", async () => {
    const preparedSql: string[] = [];
    const rows = [
      { congress: 119, digest_json: null as string | null },
      {
        congress: 119,
        digest_json: JSON.stringify({ headline: "Ok", what_it_does: "Works" }),
      },
      {
        congress: 119,
        digest_json: JSON.stringify({ headline: "", what_it_does: "Missing headline" }),
      },
      {
        congress: 119,
        digest_json: JSON.stringify({ headline: "Has headline" }),
      },
      { congress: 119, digest_json: "{not-json" },
      { congress: 118, digest_json: null },
    ];
    const db = {
      exec: vi.fn(async () => {}),
      prepare(sql: string) {
        preparedSql.push(sql);
        const state = {
          bind: vi.fn((...args: unknown[]) => {
            state.args = args;
            return state;
          }),
          args: [] as unknown[],
          first: vi.fn(async () => {
            if (!sql.includes("FROM bill_digests")) return null;
            // D1 throws on json_extract(malformed) — query must gate with json_valid.
            expect(sql).toContain("json_valid(digest_json) = 0");
            expect(sql).toContain("CASE WHEN json_valid(digest_json) = 1 THEN digest_json END");
            expect(sql).toContain("$.headline");
            expect(sql).toContain("$.what_it_does");
            const congress = Number(state.args[0]);
            const missing = rows.filter((row) => {
              if (row.congress !== congress) return false;
              if (row.digest_json == null) return true;
              try {
                const parsed = JSON.parse(row.digest_json) as {
                  headline?: unknown;
                  what_it_does?: unknown;
                };
                return !parsed.headline || !parsed.what_it_does;
              } catch {
                return true;
              }
            }).length;
            return { missing_count: missing };
          }),
          run: vi.fn(async () => ({ success: true, meta: { duration: 0 } })),
        };
        return state;
      },
    } as unknown as D1Database;
    const env = { DB: db, CONGRESS: "119", SESSION: "2" } as Env;

    await expect(getMissingDigestCount(env)).resolves.toBe(4);
    expect(preparedSql.some((sql) => sql.includes("FROM bill_digests"))).toBe(true);
  });
});
