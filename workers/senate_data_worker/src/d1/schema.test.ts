import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SCHEMA_VERSION,
  ensureSchema,
  getAppliedSchemaVersionForTests,
  resetSchemaFlag,
} from "./schema";

function createVersionedMockDb(initialVersion: number | null) {
  const store = new Map<string, { value_json: string; updated_at: string }>();
  if (initialVersion !== null) {
    store.set("schema_version", {
      value_json: JSON.stringify({ version: initialVersion }),
      updated_at: "2026-01-01T00:00:00.000Z",
    });
  }
  const ranSql: string[] = [];

  const db = {
    prepare(sql: string) {
      ranSql.push(sql);
      const state = {
        args: [] as unknown[],
        bind: (...args: unknown[]) => {
          state.args = args;
          return state;
        },
        first: async () => {
          if (sql.includes("FROM pipeline_state")) {
            const key = String(state.args[0]);
            const row = store.get(key);
            return row ? { value_json: row.value_json } : null;
          }
          return null;
        },
        run: async () => {
          if (sql.includes("INSERT INTO pipeline_state")) {
            const [key, valueJson, updatedAt] = state.args;
            store.set(String(key), {
              value_json: String(valueJson),
              updated_at: String(updatedAt),
            });
          }
          return { success: true, meta: { changes: 1, duration: 0 } };
        },
      };
      return state;
    },
  } as unknown as D1Database;

  return { db, store, ranSql };
}

describe("ensureSchema versioning", () => {
  beforeEach(() => {
    resetSchemaFlag();
  });

  it("runs DDL and one-shot migration when no version is stored", async () => {
    const { db, store, ranSql } = createVersionedMockDb(null);
    await ensureSchema(db);

    expect(ranSql.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS votes"))).toBe(true);
    expect(ranSql.some((sql) => sql.includes("DELETE FROM financial_transactions"))).toBe(true);
    expect(store.get("schema_version")?.value_json).toBe(
      JSON.stringify({ version: SCHEMA_VERSION })
    );
    expect(getAppliedSchemaVersionForTests()).toBe(SCHEMA_VERSION);
  });

  it("skips DDL when stored version matches (cold start)", async () => {
    const { db, ranSql } = createVersionedMockDb(SCHEMA_VERSION);
    await ensureSchema(db);

    expect(ranSql.filter((sql) => sql.includes("CREATE TABLE")).length).toBe(0);
    expect(ranSql.filter((sql) => sql.includes("DELETE FROM financial_transactions")).length).toBe(
      0
    );
    expect(getAppliedSchemaVersionForTests()).toBe(SCHEMA_VERSION);
  });

  it("uses isolate-local fast path on warm requests", async () => {
    const { db, ranSql } = createVersionedMockDb(SCHEMA_VERSION);
    await ensureSchema(db);
    const afterFirst = ranSql.length;
    await ensureSchema(db);
    expect(ranSql.length).toBe(afterFirst);
  });

  it("does not re-run the one-shot DELETE after version is stored", async () => {
    const first = createVersionedMockDb(null);
    await ensureSchema(first.db);
    resetSchemaFlag();

    const second = createVersionedMockDb(SCHEMA_VERSION);
    await ensureSchema(second.db);
    expect(
      second.ranSql.filter((sql) => sql.includes("DELETE FROM financial_transactions")).length
    ).toBe(0);
  });

  it("does not downgrade schema_version when the database is ahead", async () => {
    const { db, store, ranSql } = createVersionedMockDb(SCHEMA_VERSION + 1);
    await ensureSchema(db);

    expect(ranSql.filter((sql) => sql.includes("CREATE TABLE")).length).toBe(0);
    expect(store.get("schema_version")?.value_json).toBe(
      JSON.stringify({ version: SCHEMA_VERSION + 1 })
    );
    expect(getAppliedSchemaVersionForTests()).toBe(SCHEMA_VERSION);
  });
});
