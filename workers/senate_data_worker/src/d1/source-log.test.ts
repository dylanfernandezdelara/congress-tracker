import { describe, expect, it } from "vitest";

import { readSourceFetchLog, recordSourceFetchLog } from "./source-log";
import { createSchemaTrackingDb } from "./test-helpers";

describe("source_fetch_log", () => {
  it("inserts and reads by cache key", async () => {
    const db = createSchemaTrackingDb();
    const stores = new Map<string, Record<string, unknown>>();

    const originalPrepare = db.prepare.bind(db);
    db.prepare = (sql: string) => {
      const normalized = sql.replace(/\s+/g, " ").trim();
      let bound: unknown[] = [];
      const statement = originalPrepare(sql);
      if (normalized.startsWith("INSERT OR REPLACE INTO source_fetch_log")) {
        return {
          bind(...values: unknown[]) {
            bound = values;
            return {
              async run() {
                stores.set(String(bound[0]), {
                  cache_key: bound[0],
                  source: bound[1],
                  entity_key: bound[2],
                  request_url: bound[3],
                  status_code: bound[4],
                  content_type: bound[5],
                  artifact_key: bound[6],
                  fetched_at: bound[7],
                  error_message: bound[8],
                  metadata_json: bound[9],
                });
                return { success: true, meta: { duration: 0 } };
              },
              async all<T>() {
                return { results: [], success: true, meta: { duration: 0 } } as T;
              },
            } as D1PreparedStatement;
          },
        } as D1PreparedStatement;
      }
      if (normalized.includes("FROM source_fetch_log")) {
        return {
          bind(cacheKey: unknown) {
            const row = stores.get(String(cacheKey));
            return {
              async run() {
                return { success: true, meta: { duration: 0 } };
              },
              async all<T>() {
                return {
                  results: row ? [row] : [],
                  success: true,
                  meta: { duration: 0 },
                } as T;
              },
            } as D1PreparedStatement;
          },
        } as D1PreparedStatement;
      }
      return statement;
    };

    await recordSourceFetchLog(db, {
      cacheKey: "govinfo:crec:2026-01-17",
      source: "govinfo",
      entityKey: "crec-2026-01-17",
      requestUrl: "https://example.com/crec",
      statusCode: 200,
      fetchedAt: "2026-01-17T12:00:00Z",
      metadata: { bytes: 1024 },
    });

    const record = await readSourceFetchLog(db, "govinfo:crec:2026-01-17");
    expect(record).toMatchObject({
      cacheKey: "govinfo:crec:2026-01-17",
      source: "govinfo",
      entityKey: "crec-2026-01-17",
      statusCode: 200,
      metadata: { bytes: 1024 },
    });
  });
});
