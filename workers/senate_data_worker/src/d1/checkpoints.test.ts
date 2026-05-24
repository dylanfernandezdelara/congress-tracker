import { describe, expect, it } from "vitest";

import { readPipelineCheckpoint, writePipelineCheckpoint } from "./checkpoints";
import { createSchemaTrackingDb } from "./test-helpers";

describe("pipeline_checkpoints", () => {
  it("writes and reads cursor JSON", async () => {
    const db = createSchemaTrackingDb();
    const checkpoints = new Map<string, { cursor_json: string; updated_at: string }>();

    const originalPrepare = db.prepare.bind(db);
    db.prepare = (sql: string) => {
      const normalized = sql.replace(/\s+/g, " ").trim();
      if (normalized.startsWith("INSERT OR REPLACE INTO pipeline_checkpoints")) {
        let bound: unknown[] = [];
        return {
          bind(...values: unknown[]) {
            bound = values;
            return {
              async run() {
                checkpoints.set(String(bound[0]), {
                  cursor_json: String(bound[1]),
                  updated_at: String(bound[2]),
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
      if (normalized.includes("FROM pipeline_checkpoints")) {
        return {
          bind(checkpointKey: unknown) {
            const row = checkpoints.get(String(checkpointKey));
            return {
              async run() {
                return { success: true, meta: { duration: 0 } };
              },
              async all<T>() {
                return {
                  results: row
                    ? [
                        {
                          checkpoint_key: String(checkpointKey),
                          cursor_json: row.cursor_json,
                          updated_at: row.updated_at,
                        },
                      ]
                    : [],
                  success: true,
                  meta: { duration: 0 },
                } as T;
              },
            } as D1PreparedStatement;
          },
        } as D1PreparedStatement;
      }
      return originalPrepare(sql);
    };

    await writePipelineCheckpoint(db, "historical_backfill:119:all", {
      session_index: 2,
      offset: 40,
    });

    const checkpoint = await readPipelineCheckpoint<{ session_index: number; offset: number }>(
      db,
      "historical_backfill:119:all"
    );
    expect(checkpoint).toMatchObject({
      checkpointKey: "historical_backfill:119:all",
      cursor: { session_index: 2, offset: 40 },
    });
    expect(checkpoint?.updatedAt).toBeTruthy();
  });
});
