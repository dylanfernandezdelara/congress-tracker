import { describe, expect, it } from "vitest";

import { ensurePlatformSchema } from "./schema";
import { createSchemaTrackingDb } from "./test-helpers";

describe("ensurePlatformSchema", () => {
  it("runs twice on an empty DB without throwing", async () => {
    const db = createSchemaTrackingDb();
    await expect(ensurePlatformSchema(db)).resolves.toBeUndefined();
    await expect(ensurePlatformSchema(db)).resolves.toBeUndefined();
  });

  it("creates expected platform tables", async () => {
    const db = createSchemaTrackingDb();
    await ensurePlatformSchema(db);
    for (const table of [
      "votes",
      "ingested_vote_details",
      "vote_members",
      "bills",
      "issue_threads",
      "daily_briefings",
      "vote_read_models",
      "source_fetch_log",
      "pipeline_checkpoints",
    ]) {
      expect(db.tables.has(table), `missing table ${table}`).toBe(true);
    }
    expect(db.indexes.has("idx_ingested_vote_details_date")).toBe(true);
  });
});
