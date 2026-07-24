import { beforeEach, describe, expect, it, vi } from "vitest";
import { selectExistingVoteKeys } from "./votes";
import { resetSchemaFlag } from "./schema";

function createMockDb(rows: Array<Record<string, unknown>>): {
  db: D1Database;
  preparedSql: string[];
} {
  const preparedSql: string[] = [];
  const runResult = { success: true, meta: { duration: 0, changes: 1 } };
  const stmt = (sql: string) => {
    preparedSql.push(sql);
    return {
      bind: vi.fn(() => stmt(sql)),
      all: vi.fn(async () => ({ results: rows })),
      first: vi.fn(async () => null),
      run: vi.fn(async () => runResult),
    };
  };
  return {
    preparedSql,
    db: {
      exec: vi.fn(async () => {}),
      prepare: vi.fn((sql: string) => stmt(sql)),
    } as unknown as D1Database,
  };
}

describe("selectExistingVoteKeys", () => {
  beforeEach(() => {
    resetSchemaFlag();
  });

  it("returns vote keys for passage and non-passage rolls in the lookback window", async () => {
    const { db, preparedSql } = createMockDb([
      { chamber: "House", congress: 119, session: 2, roll_number: 10 },
      { chamber: "House", congress: 119, session: 2, roll_number: 11 },
      { chamber: "Senate", congress: 119, session: 2, roll_number: 163 },
    ]);

    const keys = await selectExistingVoteKeys(db, "2026-05-01", 119);

    expect(keys).toEqual(
      new Set(["House:119:2:10", "House:119:2:11", "Senate:119:2:163"])
    );
    const selectSql = preparedSql.find((sql) => sql.includes("FROM votes"));
    expect(selectSql).toBeDefined();
    expect(selectSql).not.toMatch(/is_passage\s*=\s*1/);
  });
});
